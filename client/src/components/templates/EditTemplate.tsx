import { useState, useEffect, useCallback, useMemo } from "react";
import { PROJECT_TYPES } from "@shared/project-types";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useTranslation } from "react-i18next";
import { DEFAULT_PROJECT_WORKING_DAYS, MAX_PROJECT_WORKING_DAYS, parseProjectWorkingDays } from "@shared/project-duration";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Save, X, Plus, Copy, Info, FileText, FolderOpen, CircleCheckBig, Waypoints, Swords, CircuitBoard, Blocks } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectDocumentSelector } from "@/components/project-form/project-document-selector";
import { ProjectLinkSelector } from "@/components/project-form/project-link-selector";
import { SuccessCriteriaForm } from "@/components/validation-criteria/success-criteria-form";
import { GuidedFormSection } from "@/components/project-form/GuidedFormSection";
import { GuidedOverviewBanner } from "@/components/project-form/GuidedOverviewBanner";
import { TiptapField } from "@/components/rich-text/TiptapField";
import { SectionInfo } from "@/components/project-form/QuickJumpDropdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MapTemplateSummary } from "@/components/project-form/MapTemplateSummary";
import { MapTemplateSelector } from "@/components/project-form/MapTemplateSelector";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import type { ConnectedCompetitorItem } from "@/components/project-form/EssentialsSection";
import { redirectToSignIn } from "@/lib/sign-in-redirect";

export default function EditTemplate() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  
  const queryClient = useQueryClient();

  // Template data state
  const [templateData, setTemplateData] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    solutionName: [] as string[],
    environment: "",
    tags: [] as string[],
    businessProblem: "",
    solutionDescription: "",
    policyConsiderations: "",
    notes: "",
    projectDocuments: [] as any[],
    projectLinks: [] as any[],
    projectTimeline: "",
    durationWorkingDays: null as number | null,
    mapTemplateId: null as number | null,
  });
  const [successCriteria, setSuccessCriteria] = useState<any[]>([]);
  const [projectLinks, setProjectLinks] = useState<{linkType: string, url: string, description: string, name?: string}[]>([]);
  

  // Selected MAP Template state
  const [selectedMapTemplate, setSelectedMapTemplate] = useState<{ 
    id: number; 
    name: string; 
    description?: string; 
    phaseCount?: number; 
    stepCount?: number; 
    taskCount?: number 
  } | null>(null);

  const [isTemplateActive, setIsTemplateActive] = useState<boolean>(true);
  const [isTemplateSystem, setIsTemplateSystem] = useState<boolean>(true);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [artifactsNotApplicable, setArtifactsNotApplicable] = useState<boolean>(true);

  const [selectedVCTemplateId, setSelectedVCTemplateId] = useState<number | null>(null);
  const [originalVCCriteria, setOriginalVCCriteria] = useState<string>("");
  const [isVCTemplateConfirmOpen, setIsVCTemplateConfirmOpen] = useState(false);
  const [pendingVCTemplateId, setPendingVCTemplateId] = useState<number | null>(null);
  const [vcTemplateLoading, setVcTemplateLoading] = useState(false);

  const [typicalCompetitors, setTypicalCompetitors] = useState<ConnectedCompetitorItem[]>([]);
  const [compPickerSpaceId, setCompPickerSpaceId] = useState<string>("");
  const [compPickerCompetitorId, setCompPickerCompetitorId] = useState<string>("");
  const [compPickerRelationship, setCompPickerRelationship] = useState<string>("");

  const RELATIONSHIP_OPTIONS = ["N/A", "Own", "Previously Owned", "Evaluating", "Previously Evaluated"];

  const { data: techSpaces = [] } = useQuery<any[]>({
    queryKey: ["/api/technology-spaces"],
    staleTime: 60000,
  });

  const { data: allCompetitors = [] } = useQuery<any[]>({
    queryKey: ["/api/competitors"],
    staleTime: 60000,
  });

  const competitorsForSelectedSpace = compPickerSpaceId
    ? allCompetitors.filter((c: any) =>
        c.spaces?.some((s: any) => (s.spaceId || s.id)?.toString() === compPickerSpaceId)
      )
    : allCompetitors;

  function hexWithAlpha(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function handleAddTypicalCompetitor() {
    if (!compPickerSpaceId || !compPickerCompetitorId || !compPickerRelationship) return;
    const alreadyAdded = typicalCompetitors.some(
      (c) => c.competitorId === parseInt(compPickerCompetitorId) && c.spaceId === parseInt(compPickerSpaceId)
    );
    if (alreadyAdded) return;
    const space = techSpaces.find((s: any) => s.id.toString() === compPickerSpaceId);
    const comp = allCompetitors.find((c: any) => c.id.toString() === compPickerCompetitorId);
    if (!space || !comp) return;
    setTypicalCompetitors((prev) => [
      ...prev,
      {
        spaceId: parseInt(compPickerSpaceId),
        competitorId: parseInt(compPickerCompetitorId),
        spaceName: space.name,
        spaceColor: space.color || "#64748b",
        competitorName: comp.name,
        relationship: compPickerRelationship,
      },
    ]);
    setCompPickerCompetitorId("");
    setCompPickerRelationship("");
  }

  function handleRemoveTypicalCompetitor(competitorId: number, spaceId: number) {
    setTypicalCompetitors((prev) => prev.filter((c) => !(c.competitorId === competitorId && c.spaceId === spaceId)));
  }

  // State for guided form sections - all collapsed by default
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    essentials: false,
    requirements: false,
    plan: false,
    artifacts: false,
    validation: false,
  });

  // Track the currently active section for ProgressSteps indicator
  const [activeSectionId, setActiveSectionId] = useState<string | undefined>(undefined);

  // Toggle section open/closed
  const toggleSection = useCallback((sectionId: string) => {
    setOpenSections(prev => {
      const newState = { ...prev, [sectionId]: !prev[sectionId] };
      if (newState[sectionId]) {
        setActiveSectionId(sectionId);
      } else {
        const orderedSections = ['essentials', 'requirements', 'plan', 'artifacts', 'validation'];
        const firstOpen = orderedSections.find(s => newState[s]);
        setActiveSectionId(firstOpen || undefined);
      }
      return newState;
    });
  }, []);

  // Scroll to and open a specific section
  const jumpToSection = useCallback((sectionId: string) => {
    // Only allow jumping to active sections (not disabled ones)
    const disabledSections = ['timeline', 'team', 'access'];
    if (disabledSections.includes(sectionId)) return;
    
    setOpenSections(prev => ({ ...prev, [sectionId]: true }));
    setActiveSectionId(sectionId);
    setTimeout(() => {
      const element = document.getElementById(`section-${sectionId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  // Section completion tracking
  const getSectionCompletion = useMemo(() => {
    return {
      essentials: {
        completed: [
          formData.name,
          formData.type,
          formData.solutionName.length > 0,
          formData.environment
        ].filter(Boolean).length,
        total: 4
      },
      requirements: {
        completed: [
          formData.businessProblem,
          formData.solutionDescription
        ].filter(Boolean).length,
        total: 2
      },
      // Optional: without a MAP template, projects start with no plan and
      // add a Quick plan from the MAP drawer.
      plan: {
        completed: selectedMapTemplate ? 1 : 0,
        total: 0
      },
      artifacts: {
        completed: artifactsNotApplicable
          ? 1
          : (formData.projectDocuments.length > 0 || projectLinks.length > 0) ? 1 : 0,
        total: 1
      },
      validation: {
        completed: successCriteria.length > 0 ? 1 : 0,
        total: 1
      }
    };
  }, [formData, successCriteria, projectLinks, selectedMapTemplate, artifactsNotApplicable]);

  // Build sections info for ProgressSteps - includes all 8 sections with disabled ones grayed out
  const sectionsInfo: SectionInfo[] = useMemo(() => [
    { id: 'essentials', stepNumber: 1, title: 'Template Details', isComplete: getSectionCompletion.essentials.completed >= getSectionCompletion.essentials.total, color: 'blue', disabled: false },
    { id: 'timeline', stepNumber: 2, title: 'Timeline', isComplete: false, color: 'green', disabled: true },
    { id: 'team', stepNumber: 3, title: 'Team', isComplete: false, color: 'purple', disabled: true },
    { id: 'access', stepNumber: 4, title: 'Access', isComplete: false, color: 'amber', disabled: true },
    { id: 'requirements', stepNumber: 5, title: 'Requirements', isComplete: getSectionCompletion.requirements.completed >= getSectionCompletion.requirements.total, color: 'red', disabled: false },
    { id: 'plan', stepNumber: 6, title: t('mapPlan.form.title'), isComplete: getSectionCompletion.plan.completed > 0, color: 'cyan', disabled: false },
    { id: 'artifacts', stepNumber: 7, title: 'Artifacts', isComplete: getSectionCompletion.artifacts.completed >= getSectionCompletion.artifacts.total, color: 'orange', disabled: false },
    { id: 'validation', stepNumber: 8, title: 'Validation Criteria', isComplete: getSectionCompletion.validation.completed >= getSectionCompletion.validation.total, color: 'brand', disabled: false },
  ], [getSectionCompletion, t]);

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      if (templateData?.mode === 'create-template' || templateData?.mode === 'duplicate-template') {
        return await apiRequest("POST", "/api/templates", data);
      } else {
        return await apiRequest("PUT", `/api/templates/${templateData?.id}`, data);
      }
    },
    onSuccess: () => {
      showSuccessToast("Success", (templateData?.mode === 'create-template' || templateData?.mode === 'duplicate-template') ? "Template created successfully!" : "Template updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setLocation("/templates?tab=project-templates");
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        redirectToSignIn();
        return;
      }
      showErrorToast("Error", "Failed to update template");
    },
  });

  // Fetch data from APIs
  const { data: products = [] } = useQuery<Array<{id: number, name: string, isActive?: boolean, solutionIcon?: string | null; solutionIconName?: string | null}>>({
    queryKey: ["/api/products"],
  });

  const { data: systemTags = [] } = useQuery<Array<{id: number, name: string, color: string}>>({
    queryKey: ["/api/tags"],
  });

  // Fetch MAP templates for selection
  const { data: mapTemplates = [] } = useQuery<Array<{
    id: number;
    name: string;
    description?: string;
    scope?: string;
    phaseCount?: number;
    stepCount?: number;
    taskCount?: number;
  }>>({
    queryKey: ["/api/map/templates"],
    queryFn: () => apiRequest("GET", "/api/map/templates"),
  });

  const { data: vcTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/validation-criteria-templates"],
    staleTime: 60000,
  });
  const activeVCTemplates = useMemo(
    () => vcTemplates.filter((t: any) => t.isActive !== false), [vcTemplates]
  );

  const solutionNameToProductId = useMemo(() => {
    return (name: string | null | undefined): number | null => {
      if (!name || !products.length) return null;
      const normalized = name.trim();
      let p = products.find((p: any) => p.name === normalized);
      if (!p) p = products.find((p: any) => p.name.toLowerCase() === normalized.toLowerCase());
      if (!p) {
        const lower = normalized.toLowerCase();
        p = products.find((p: any) =>
          p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
        );
      }
      return p ? p.id : null;
    };
  }, [products]);

  const solutionsToProductIds = useMemo(() => {
    return (solutions: string[] | null | undefined): Set<number> => {
      if (!solutions || !Array.isArray(solutions)) return new Set();
      const ids = solutions
        .map(solutionNameToProductId)
        .filter((id): id is number => id !== null);
      return new Set(ids);
    };
  }, [solutionNameToProductId]);

  const filteredVCTemplates = useMemo(() => {
    if (!formData.solutionName.length) return [];
    const currentSolutions = formData.solutionName;

    return activeVCTemplates.filter((template: any) => {
      if (!template.solutionName) return false;

      const templateSolutions: string[] = Array.isArray(template.solutionName)
        ? template.solutionName
        : [template.solutionName];

      const templateProductIds = solutionsToProductIds(templateSolutions);
      const currentProductIds = solutionsToProductIds(currentSolutions);

      const hasUnmapped =
        templateProductIds.size < templateSolutions.length ||
        currentProductIds.size < currentSolutions.length;

      if (hasUnmapped) {
        const normTemplate = templateSolutions
          .map((s) => s.toLowerCase().trim().replace(/\s+/g, '-'))
          .sort();
        const normCurrent = currentSolutions
          .map((s) => s.toLowerCase().trim().replace(/\s+/g, '-'))
          .sort();
        if (normTemplate.length !== normCurrent.length) return false;
        return normTemplate.every((s, i) => s === normCurrent[i]);
      }

      if (templateProductIds.size === 0 || currentProductIds.size === 0) return false;
      if (templateProductIds.size !== currentProductIds.size) return false;

      return (
        Array.from(templateProductIds).every((id) => currentProductIds.has(id)) &&
        Array.from(currentProductIds).every((id) => templateProductIds.has(id))
      );
    });
  }, [activeVCTemplates, formData.solutionName, solutionsToProductIds]);

  // Rehydrate selectedMapTemplate when mapTemplates load and formData.mapTemplateId is set
  useEffect(() => {
    if (formData.mapTemplateId && mapTemplates.length > 0 && !selectedMapTemplate) {
      const savedTemplate = mapTemplates.find(t => t.id === formData.mapTemplateId);
      if (savedTemplate) {
        setSelectedMapTemplate(savedTemplate);
      }
    }
  }, [mapTemplates, formData.mapTemplateId, selectedMapTemplate]);

  const buildCriteriaFromVCTemplate = useCallback(async (templateId: number) => {
    setVcTemplateLoading(true);
    try {
      const details = await apiRequest('GET', `/api/validation-criteria-templates/${templateId}`);
      const links = (details as any).links || [];
      const criteriaArray: any[] = [];
      let skippedCount = 0;

      for (const link of links) {
        try {
          if (!link.productId || !link.criteriaId) { skippedCount++; continue; }
          const solution = await apiRequest('GET', `/api/products/${link.productId}`);
          const criteria = await apiRequest('GET', `/api/criteria/${link.criteriaId}`);
          let outcome = null;
          if (link.expectedOutcomeId) {
            try { outcome = await apiRequest('GET', `/api/outcomes/${link.expectedOutcomeId}`); } catch {}
          }
          let action = null;
          if (link.actionItemId) {
            try { action = await apiRequest('GET', `/api/actions/${link.actionItemId}`); } catch {}
          }
          let component = null;
          if (link.componentId) {
            try { component = await apiRequest('GET', `/api/components/${link.componentId}`); } catch {}
          }
          criteriaArray.push({
            productName: (solution as any).name,
            componentId: link.componentId || null,
            componentName: (component as any)?.name || "",
            criterion: (criteria as any).name,
            expectedOutcome: (outcome as any)?.name || "",
            actionItem: (action as any)?.name || "",
            status: "not_started",
            criteriaId: link.criteriaId,
            expectedOutcomeId: link.expectedOutcomeId || null,
            actionItemId: link.actionItemId || null,
            isActive: true,
            activeFields: {
              component: !!link.componentId && !!component,
              expectedOutcome: !!link.expectedOutcomeId && !!outcome,
              actionItem: !!link.actionItemId && !!action,
            },
          } as any);
        } catch {
          skippedCount++;
        }
      }

      setSuccessCriteria(criteriaArray);
      setOriginalVCCriteria(JSON.stringify(criteriaArray));

      if (skippedCount > 0) {
        showWarningToast("Template Applied with Warnings", `Loaded ${criteriaArray.length} criteria. ${skippedCount} rows skipped.`);
      } else {
        showSuccessToast("Template Applied", `Loaded ${criteriaArray.length} validation criteria from template.`);
      }
    } catch (error) {
      console.error("Failed to load VC template:", error);
      showErrorToast("Error", "Failed to load validation criteria template.");
    } finally {
      setVcTemplateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVCTemplateId && originalVCCriteria === "" && !vcTemplateLoading) {
      if (successCriteria.length > 0 && templateData?.validationCriteriaTemplateId === selectedVCTemplateId) {
        setOriginalVCCriteria(JSON.stringify(successCriteria));
      } else if (!templateData?.validationCriteriaTemplateId || templateData.validationCriteriaTemplateId !== selectedVCTemplateId) {
        buildCriteriaFromVCTemplate(selectedVCTemplateId);
      }
    }
  }, [selectedVCTemplateId, originalVCCriteria, vcTemplateLoading, templateData, buildCriteriaFromVCTemplate]);

  const isVCTemplateEdited = selectedVCTemplateId !== null &&
    originalVCCriteria !== "" &&
    JSON.stringify(successCriteria) !== originalVCCriteria;

  // Load template data from sessionStorage or localStorage
  useEffect(() => {
    const pendingTemplate = localStorage.getItem("pendingTemplateData");
    const savedTemplate = sessionStorage.getItem("templateData");
    
    if (pendingTemplate) {
      try {
        const template = JSON.parse(pendingTemplate);
        setTemplateData(template);
        
        setFormData({
          name: template.name || "",
          type: template.type || "",
          solutionName: Array.isArray(template.solutionName) ? template.solutionName : (template.solutionName ? [template.solutionName] : []),
          environment: template.environment || "",
          tags: template.tags || [],
          businessProblem: template.businessProblem || "",
          solutionDescription: template.solutionDescription || "",
          policyConsiderations: template.policyConsiderations || "",
          notes: template.notes || "",
          projectDocuments: template.projectDocuments || template.uploadedFiles || [],
          projectLinks: template.projectLinks || [],
          projectTimeline: template.projectTimeline || "",
          durationWorkingDays: parseProjectWorkingDays(template.durationWorkingDays),
          mapTemplateId: template.mapTemplateId || null,
        });

        const criteriaToLoad = template.successCriteria || template.successCriteriaTemplates;
        if (criteriaToLoad) {
          setSuccessCriteria(criteriaToLoad);
        }

        if (template.projectLinks) {
          setProjectLinks(template.projectLinks);
        }

        if (Array.isArray(template.typicalCompetitors)) {
          setTypicalCompetitors(template.typicalCompetitors);
        }

        setIsTemplateActive(template.isActive !== false);
        setIsTemplateSystem(template.isSystem !== false);

        const hasArtifacts = (template.projectDocuments?.length > 0) || (template.uploadedFiles?.length > 0) || (template.projectLinks?.length > 0);
        setArtifactsNotApplicable(template.artifactsNotApplicable !== undefined ? template.artifactsNotApplicable : !hasArtifacts);

        if (template.validationCriteriaTemplateId) {
          setSelectedVCTemplateId(template.validationCriteriaTemplateId);
        }

        localStorage.removeItem("pendingTemplateData");
      } catch (error) {
        console.error("Error parsing pending template data:", error);
      }
    } else if (savedTemplate) {
      try {
        const template = JSON.parse(savedTemplate);
        setTemplateData(template);
        
        setFormData({
          name: template.name || "",
          type: template.type || template.solutionType || "",
          solutionName: Array.isArray(template.solutionName) ? template.solutionName : (template.solutionName ? [template.solutionName] : []),
          environment: template.environment || template.industry || "",
          tags: template.tags || [],
          businessProblem: template.businessProblem || "",
          solutionDescription: template.solutionDescription || "",
          policyConsiderations: template.policyConsiderations || "",
          notes: template.notes || "",
          projectDocuments: template.projectDocuments || template.uploadedFiles || [],
          projectLinks: template.projectLinks || [],
          projectTimeline: template.projectTimeline || template.estimatedDuration || "",
          durationWorkingDays: parseProjectWorkingDays(template.durationWorkingDays),
          mapTemplateId: template.mapTemplateId || null,
        });

        const criteriaToLoad = template.successCriteria || template.successCriteriaTemplates;
        if (criteriaToLoad) {
          setSuccessCriteria(criteriaToLoad);
        }

        if (template.projectLinks) {
          setProjectLinks(template.projectLinks);
        }

        if (Array.isArray(template.typicalCompetitors)) {
          setTypicalCompetitors(template.typicalCompetitors);
        }

        setIsTemplateActive(template.isActive !== false);
        setIsTemplateSystem(template.isSystem !== false);

        const hasArtifacts = (template.projectDocuments?.length > 0) || (template.uploadedFiles?.length > 0) || (template.projectLinks?.length > 0);
        setArtifactsNotApplicable(template.artifactsNotApplicable !== undefined ? template.artifactsNotApplicable : !hasArtifacts);

        if (template.validationCriteriaTemplateId) {
          setSelectedVCTemplateId(template.validationCriteriaTemplateId);
        }

        sessionStorage.removeItem("templateData");
      } catch (error) {
        console.error("Error parsing template data:", error);
        showErrorToast("Error", "Failed to load template data");
      }
    } else {
      showErrorToast("No Template Data", "No template data found. Redirecting to Artifacts.");
      setLocation("/artifacts");
    }
  }, [setLocation]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToSignIn();
      return;
    }
  }, [isAuthenticated, authLoading]);

  const handleSubmit = async () => {
    const failedSections: string[] = [];
    if (getSectionCompletion.essentials.completed < getSectionCompletion.essentials.total) {
      failedSections.push("Step 1 – Template Details: Name, Type, Solution, and Environment are all required.");
    }
    if (getSectionCompletion.requirements.completed < getSectionCompletion.requirements.total) {
      failedSections.push("Step 5 – Stakeholder Requirements: Business Problem and Solution Description are required.");
    }
    if (getSectionCompletion.artifacts.completed < getSectionCompletion.artifacts.total) {
      failedSections.push("Step 7 – Project Artifacts: Add at least one document or link, or mark as Not Applicable.");
    }
    if (getSectionCompletion.validation.completed < getSectionCompletion.validation.total) {
      failedSections.push("Step 8 – Validation Criteria: At least one validation criterion is required.");
    }

    if (failedSections.length > 0) {
      showErrorToast("Cannot Save Template", failedSections.length === 1
          ? failedSections[0]
          : `${failedSections.length} sections need attention: ${failedSections.join(" • ")}`);
      const sectionMap: Record<string, string> = {
        "Step 1": "essentials",
        "Step 5": "requirements",
        "Step 7": "artifacts",
        "Step 8": "validation",
      };
      const firstFailKey = Object.keys(sectionMap).find(k => failedSections[0].startsWith(k));
      if (firstFailKey) jumpToSection(sectionMap[firstFailKey]);
      return;
    }

    try {
      const templateDataToSave = {
        ...formData,
        // Not edited on this page; kept so a duplicate doesn't drop it.
        customerObjective: templateData?.customerObjective || "",
        successCriteria,
        successCriteriaTemplates: successCriteria,
        projectLinks,
        typicalCompetitors,
        artifactsNotApplicable,
        isActive: isTemplateActive,
        isSystem: isTemplateSystem,
        id: templateData?.id,
        description: `Template for ${formData.name}`,
        industry: formData.environment,
        solutionType: formData.solutionName?.[0] || formData.type,
        estimatedDuration: formData.projectTimeline || '2-3 weeks',
        successCriteriaCount: successCriteria.length,
        usageCount: templateData?.usageCount || 0,
        isStarred: templateData?.isStarred || false,
        lastUsed: new Date().toISOString().split('T')[0],
        mode: templateData?.mode,
        mapTemplateId: selectedMapTemplate?.id || null,
        mapTemplateName: selectedMapTemplate?.name || null,
        validationCriteriaTemplateId: selectedVCTemplateId || null,
        validationCriteriaTemplateName: selectedVCTemplateId
          ? (activeVCTemplates.find((t: any) => t.id === selectedVCTemplateId)?.name || null)
          : null,
        updatedAt: new Date().toISOString()
      };
      
      await saveTemplateMutation.mutateAsync(templateDataToSave);
    } catch (error) {
      console.error("Submit error:", error);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSolutionChange = (selectedSolutions: string[]) => {
    setFormData(prev => ({
      ...prev,
      solutionName: selectedSolutions
    }));
  };

  const handleRemoveMapTemplate = () => {
    setSelectedMapTemplate(null);
    setFormData(prev => ({ ...prev, mapTemplateId: null }));
  };

  // Helper function to get product info (name and icon) with fallback matching
  const getProductInfo = (solutionName: string) => {
    if (!solutionName || !solutionName.trim()) {
      return null;
    }
    
    // Try exact match first
    let product = products.find((p) => p.name === solutionName);
    
    // If no exact match, try case-insensitive match
    if (!product) {
      product = products.find((p) => p.name.toLowerCase() === solutionName.toLowerCase());
    }
    
    // If still no match, try partial matching
    if (!product) {
      const lowerSolution = solutionName.toLowerCase();
      product = products.find((p) => {
        const lowerProduct = p.name.toLowerCase();
        return lowerProduct.length > 0 && (lowerSolution.includes(lowerProduct) || lowerProduct.includes(lowerSolution));
      });
    }
    
    return {
      name: product?.name || solutionName,
      icon: product?.solutionIcon,
      iconName: product?.solutionIconName ?? null,
    };
  };

  if (authLoading || !templateData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="dark:text-slate-200">Loading template...</p>
        </div>
      </div>
    );
  }

  const getPageTitle = () => {
    if (templateData?.mode === 'create-template') {
      return "New Project Template";
    } else if (templateData?.mode === 'duplicate-template') {
      return "New (Duplicated) Project Template";
    } else {
      return "Edit Project Template";
    }
  };

  return (
    <div className="space-y-4">
      <Card className="dark:bg-slate-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div>
                <div className="flex items-center gap-2">
                  <FileText data-title-icon className="h-5 w-5" />
                  <CardTitle className="dark:text-slate-100">Project Template</CardTitle>
                </div>
                <CardDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Define a reusable project template with default configurations, requirements, a MAP template, artifacts, and validation criteria. Templates streamline the creation of new projects.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleSubmit}
                disabled={saveTemplateMutation.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                <Save className="h-4 w-4 mr-2 text-white" />
                {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <div className="space-y-8">
            {/* Project Overview Banner with ProgressSteps */}
            <GuidedOverviewBanner
              templateName={formData.name || "Untitled Template"}
              projectType={formData.type}
              environment={formData.environment}
              solutions={formData.solutionName}
              competingWith={typicalCompetitors}
              products={products}
              sections={sectionsInfo}
              onJumpToSection={jumpToSection}
              activeSectionId={activeSectionId}
              mapTemplateName={selectedMapTemplate?.name}
              showValidationCriteria={true}
              editModeControls={
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-sm font-medium text-gray-600 dark:text-slate-400">Timeline:</Label>
                    <Select
                      value={formData.projectTimeline}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, projectTimeline: value }))}
                    >
                      <SelectTrigger className="w-32 h-8 text-sm">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-2 Weeks">1-2 Weeks</SelectItem>
                        <SelectItem value="3-4 Weeks">3-4 Weeks</SelectItem>
                        <SelectItem value="5-6 Weeks">5-6 Weeks</SelectItem>
                        <SelectItem value="7+ Weeks">7+ Weeks</SelectItem>
                      </SelectContent>
                    </Select>
                    <Label htmlFor="template-duration-working-days" className="text-sm font-medium text-gray-600 dark:text-slate-400 ml-2">
                      {t("templates.projectDuration.label")}
                    </Label>
                    <Input
                      id="template-duration-working-days"
                      type="number"
                      min={1}
                      max={MAX_PROJECT_WORKING_DAYS}
                      step={1}
                      value={formData.durationWorkingDays ?? ""}
                      placeholder={String(DEFAULT_PROJECT_WORKING_DAYS)}
                      title={t("templates.projectDuration.hint", { count: DEFAULT_PROJECT_WORKING_DAYS })}
                      onChange={(e) => setFormData(prev => ({ ...prev, durationWorkingDays: parseProjectWorkingDays(e.target.value) }))}
                      className="h-8 w-20 text-sm"
                      data-testid="template-duration-working-days"
                    />
                  </div>
                  <div className="flex items-center gap-4 ml-auto">
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id="template-system"
                          checked={isTemplateSystem}
                          onCheckedChange={setIsTemplateSystem}
                        />
                        <Label
                          htmlFor="template-system"
                          className={`text-sm font-medium cursor-pointer ${isTemplateSystem ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"}`}
                        >
                          {isTemplateSystem ? "System" : "Custom"}
                        </Label>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Switch
                        id="template-active"
                        checked={isTemplateActive}
                        onCheckedChange={setIsTemplateActive}
                      />
                      <Label
                        htmlFor="template-active"
                        className={`text-sm font-medium cursor-pointer ${isTemplateActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-slate-500"}`}
                      >
                        {isTemplateActive ? "Active" : "Inactive"}
                      </Label>
                    </div>
                  </div>
                </div>
              }
            />

            <div className="space-y-4">
          
          {/* Section 1: Template Details (Blue) */}
          <GuidedFormSection
            id="section-essentials"
            stepNumber={1}
            title="Template Details"
            icon={<Info className="h-5 w-5" />}
            isOpen={openSections.essentials}
            onToggle={() => toggleSection('essentials')}
            completedFields={getSectionCompletion.essentials.completed}
            totalRequiredFields={getSectionCompletion.essentials.total}
            color="blue"
          >
            {/* Non-editable audit metadata row (only for existing templates) */}
            {templateData?.id && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-md text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-slate-700">
                <span>
                  <span className="font-medium text-gray-600 dark:text-gray-300">Created By:</span>{" "}
                  {templateData.createdByUser
                    ? `${templateData.createdByUser.firstName || ''} ${templateData.createdByUser.lastName || ''}`.trim() || templateData.createdByUser.email || '—'
                    : templateData.createdByName || '—'}
                </span>
                <span>
                  <span className="font-medium text-gray-600 dark:text-gray-300">Created At:</span>{" "}
                  {templateData.createdAt ? new Date(templateData.createdAt).toLocaleDateString() : '—'}
                </span>
                <span>
                  <span className="font-medium text-gray-600 dark:text-gray-300">Last Updated:</span>{" "}
                  {templateData.updatedAt ? new Date(templateData.updatedAt).toLocaleDateString() : '—'}
                </span>
                <span>
                  <span className="font-medium text-gray-600 dark:text-gray-300">Updated By:</span>{" "}
                  {templateData.updatedByUser
                    ? `${templateData.updatedByUser.firstName || ''} ${templateData.updatedByUser.lastName || ''}`.trim() || templateData.updatedByUser.email || '—'
                    : templateData.updatedByName || '—'}
                </span>
              </div>
            )}
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="dark:text-slate-200">Template Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Template name"
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>

                {/* Type */}
                <div className="space-y-2">
                  <Label htmlFor="type" className="dark:text-slate-200">Type <span className="text-red-500">*</span></Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
                  >
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_TYPES.map((projectType) => (
                        <SelectItem key={projectType} value={projectType}>{projectType}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Solution Name - Multi-select */}
                <div className="space-y-2">
                  <Label className="dark:text-slate-200">Solution Name <span className="text-red-500">*</span></Label>
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value && !formData.solutionName.includes(value)) {
                        const newSolutions = [...formData.solutionName, value];
                        setFormData(prev => ({ ...prev, solutionName: newSolutions }));
                        handleSolutionChange(newSolutions);
                      }
                    }}
                  >
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <SelectValue placeholder="Add solution" />
                    </SelectTrigger>
                    <SelectContent>
                      {products
                        .filter((product) => 
                          product.isActive !== false && 
                          !formData.solutionName.includes(product.name)
                        )
                        .map((product) => (
                          <SelectItem key={product.id} value={product.name}>
                            {product.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <TooltipProvider>
                      {formData.solutionName.map((solution, index) => {
                        const productInfo = getProductInfo(solution);
                        if (!productInfo) return null;
                        return (
                          <div key={index} className="flex items-center gap-1">
                            <SolutionBadge
                              solutionName={productInfo.name}
                              solutionIcon={productInfo.icon} solutionIconName={productInfo.iconName}
                            />
                            <X
                              className="h-3 w-3 cursor-pointer text-gray-500 hover:text-red-500"
                              onClick={() => {
                                const newSolutions = formData.solutionName.filter((_, i) => i !== index);
                                setFormData(prev => ({ ...prev, solutionName: newSolutions }));
                                handleSolutionChange(newSolutions);
                              }}
                            />
                          </div>
                        );
                      })}
                    </TooltipProvider>
                  </div>
                </div>

                {/* Environment */}
                <div className="space-y-2">
                  <Label htmlFor="environment" className="dark:text-slate-200">Environment <span className="text-red-500">*</span></Label>
                  <Select
                    value={formData.environment}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, environment: value }))}
                  >
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <SelectValue placeholder="Select environment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CloudLAB">CloudLAB</SelectItem>
                      <SelectItem value="OnPremise Production">OnPremise Production</SelectItem>
                      <SelectItem value="OnPremise PreProd">OnPremise PreProd</SelectItem>
                      <SelectItem value="SaaS">SaaS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Typical Competitors To Compete With */}
              <div className="space-y-2">
                <Label className="text-sm font-medium dark:text-slate-200 flex items-center gap-1.5">
                  <Swords className="h-4 w-4 text-red-500" />
                  Typical Competitors To Compete With
                </Label>

                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Technology Space</Label>
                    <Select
                      value={compPickerSpaceId}
                      onValueChange={(val) => {
                        setCompPickerSpaceId(val);
                        setCompPickerCompetitorId("");
                        setCompPickerRelationship("");
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <SelectValue placeholder="Select space..." />
                      </SelectTrigger>
                      <SelectContent>
                        {techSpaces.map((s: any) => (
                          <SelectItem key={s.id} value={s.id.toString()}>
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || "#64748b" }} />
                              {s.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Competitor</Label>
                    <Select
                      value={compPickerCompetitorId}
                      onValueChange={(val) => {
                        setCompPickerCompetitorId(val);
                        setCompPickerRelationship("N/A");
                      }}
                      disabled={!compPickerSpaceId}
                    >
                      <SelectTrigger className="h-8 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <SelectValue placeholder={compPickerSpaceId ? "Select competitor..." : "Choose space first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {competitorsForSelectedSpace.map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Relationship</Label>
                    <Select
                      value={compPickerRelationship}
                      onValueChange={setCompPickerRelationship}
                      disabled={true}
                    >
                      <SelectTrigger className="h-8 text-sm dark:bg-slate-800 dark:border-slate-700 opacity-60 cursor-not-allowed">
                        <SelectValue placeholder="N/A" />
                      </SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIP_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={handleAddTypicalCompetitor}
                    disabled={!compPickerSpaceId || !compPickerCompetitorId || !compPickerRelationship}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>

                {typicalCompetitors.length === 0 ? (
                  <div className="text-sm text-gray-400 dark:text-slate-500 italic py-3 px-3 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                    No typical competitors added yet
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {typicalCompetitors.map((cc) => {
                      const isHex = cc.spaceColor?.startsWith("#");
                      const bgColor = isHex ? hexWithAlpha(cc.spaceColor, 0.08) : "rgba(100,116,139,0.08)";
                      const borderColor = isHex ? hexWithAlpha(cc.spaceColor, 0.25) : "rgba(100,116,139,0.25)";
                      const textColor = isHex ? cc.spaceColor : "#64748b";
                      return (
                        <div
                          key={`${cc.competitorId}-${cc.spaceId}`}
                          className="flex items-center justify-between rounded-lg border px-3 py-2"
                          style={{ borderColor, backgroundColor: bgColor }}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <Swords className="h-3.5 w-3.5 shrink-0" style={{ color: textColor }} />
                            <span className="text-sm font-medium" style={{ color: textColor }}>
                              {cc.competitorName}
                            </span>
                            <span
                              className="text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                              style={{
                                backgroundColor: isHex ? hexWithAlpha(cc.spaceColor, 0.2) : "rgba(100,116,139,0.2)",
                                color: textColor,
                              }}
                            >
                              {cc.spaceName}
                            </span>
                            {cc.relationship && (
                              <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                                {cc.relationship}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveTypicalCompetitor(cc.competitorId, cc.spaceId)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label className="dark:text-slate-200">Tags</Label>
                <div className="space-y-2">
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value && !formData.tags.includes(value)) {
                        setFormData(prev => ({ ...prev, tags: [...prev.tags, value] }));
                      }
                    }}
                  >
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <SelectValue placeholder="Add system tag" />
                    </SelectTrigger>
                    <SelectContent>
                      {systemTags
                        .filter((tag) => !formData.tags.includes(tag.name))
                        .map((tag) => (
                          <SelectItem key={tag.id} value={tag.name}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: tag.color || '#64748B' }}
                              ></div>
                              {tag.name}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag, index) => {
                      const systemTag = systemTags?.find((t) => t.name === tag);
                      const tagColor = systemTag?.color || '#64748B';
                      
                      return (
                        <Badge 
                          key={index} 
                          variant="secondary" 
                          className="flex items-center gap-1"
                          style={{ backgroundColor: tagColor, color: 'white' }}
                        >
                          {tag}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => handleRemoveTag(tag)}
                          />
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </GuidedFormSection>

          {/* Section 5: Stakeholder Requirements (Red) */}
          <GuidedFormSection
            id="section-requirements"
            stepNumber={5}
            title="Stakeholder Requirements: Describe, Define, and Design"
            icon={<FileText className="h-5 w-5" />}
            isOpen={openSections.requirements}
            onToggle={() => toggleSection('requirements')}
            completedFields={getSectionCompletion.requirements.completed}
            totalRequiredFields={getSectionCompletion.requirements.total}
            color="red"
          >
            <div className="space-y-6">
              <TiptapField
                label="Business Problem"
                placeholder="Describe the business problem this template addresses..."
                value={formData.businessProblem || ''}
                onChange={(value) => setFormData(prev => ({ ...prev, businessProblem: value }))}
                toolbar="compact"
                size="sm"
                required
              />

              <TiptapField
                label="Solution Description"
                placeholder="Describe the proposed solution..."
                value={formData.solutionDescription || ''}
                onChange={(value) => setFormData(prev => ({ ...prev, solutionDescription: value }))}
                toolbar="compact"
                size="sm"
                required
              />

              <TiptapField
                label="Policy Considerations"
                placeholder="Policy considerations for this template..."
                value={formData.policyConsiderations || ''}
                onChange={(value) => setFormData(prev => ({ ...prev, policyConsiderations: value }))}
                toolbar="compact"
                size="sm"
              />

              <TiptapField
                label="Notes"
                placeholder="Additional notes..."
                value={formData.notes || ''}
                onChange={(value) => setFormData(prev => ({ ...prev, notes: value }))}
                toolbar="compact"
                size="sm"
              />
            </div>
          </GuidedFormSection>

          {/* Section 6: Mutual Action Plan (Cyan) */}
          <GuidedFormSection
            id="section-plan"
            stepNumber={6}
            title={t("mapPlan.form.title")}
            icon={<Waypoints className="h-5 w-5" />}
            isOpen={openSections.plan}
            onToggle={() => toggleSection('plan')}
            completedFields={getSectionCompletion.plan.completed}
            totalRequiredFields={getSectionCompletion.plan.total}
            color="cyan"
            description={t("mapPlan.form.templateDescription")}
            headerActions={
              selectedMapTemplate ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedMapTemplate}
                  onClick={() => {
                    if (selectedMapTemplate) {
                      setLocation('/templates?tab=map-library');
                    }
                  }}
                  className={!selectedMapTemplate ? "opacity-50 cursor-not-allowed" : "bg-primary hover:bg-primary/90"}
                >
                  <CircuitBoard className="h-4 w-4 mr-2" />
                  {t("mapPlan.form.editTemplateMap")}
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-6">
              <div className="space-y-4">
                {selectedMapTemplate ? (
                  <MapTemplateSummary
                    templateName={selectedMapTemplate.name}
                    description={selectedMapTemplate.description}
                    phaseCount={selectedMapTemplate.phaseCount}
                    stepCount={selectedMapTemplate.stepCount}
                    taskCount={selectedMapTemplate.taskCount}
                    onDelete={handleRemoveMapTemplate}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-gray-300 rounded-lg dark:border-slate-700">
                    <Waypoints className="h-8 w-8 text-gray-400 dark:text-slate-500 mb-4" />
                    <p className="text-gray-500 mb-1 dark:text-slate-400">{t("mapPlan.form.noTemplate")}</p>
                    <p className="text-xs text-gray-500 mb-4 dark:text-slate-400 max-w-md">{t("mapPlan.form.templateQuickPlanHint")}</p>
                    <Button
                      type="button"
                      onClick={() => setIsMapPickerOpen(true)}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Waypoints className="h-4 w-4 mr-2" />
                      {t("mapPlan.form.useTemplate")}
                    </Button>
                    {mapTemplates.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">{t("mapPlan.form.libraryEmpty")}</p>
                    )}
                  </div>
                )}

                <MapTemplateSelector
                  open={isMapPickerOpen}
                  onOpenChange={setIsMapPickerOpen}
                  projectId={-1}
                  onTemplateSelected={(template) => {
                    if (template) {
                      setSelectedMapTemplate(template);
                      setFormData(prev => ({ ...prev, mapTemplateId: template.id }));
                    }
                  }}
                />
              </div>
            </div>
          </GuidedFormSection>

          {/* Section 7: Project Artifacts (Orange) */}
          <GuidedFormSection
            id="section-artifacts"
            stepNumber={7}
            title="Project Artifacts"
            icon={<FolderOpen className="h-5 w-5" />}
            isOpen={openSections.artifacts}
            onToggle={() => toggleSection('artifacts')}
            completedFields={getSectionCompletion.artifacts.completed}
            totalRequiredFields={getSectionCompletion.artifacts.total}
            color="orange"
            description="Add documents and links related to this template"
            headerActions={
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className={`text-xs font-medium ${!artifactsNotApplicable ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-slate-500'}`}>
                  Required
                </span>
                <Switch
                  id="artifacts-na"
                  checked={artifactsNotApplicable}
                  onCheckedChange={setArtifactsNotApplicable}
                />
                <span className={`text-xs font-medium ${artifactsNotApplicable ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-slate-500'}`}>
                  Not Applicable
                </span>
              </div>
            }
          >
            <div className="space-y-6">
              {/* Project Documents */}
              <div className="space-y-2">
                <Label className="dark:text-slate-200">Project Documents</Label>
                <ProjectDocumentSelector
                  selectedSolutions={formData.solutionName}
                  disableSolutionFilter={true}
                  onDocumentSelect={(doc: any) => {
                    if (!formData.projectDocuments.find((d: any) => d.id === doc.id)) {
                      setFormData(prev => ({
                        ...prev,
                        projectDocuments: [...prev.projectDocuments, doc]
                      }));
                    }
                  }}
                />
                
                {formData.projectDocuments.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <Label className="text-sm font-medium dark:text-slate-200">Selected Documents:</Label>
                    <div className="space-y-1">
                      {formData.projectDocuments.map((doc: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded dark:bg-slate-800">
                          <span className="text-sm dark:text-slate-200">{doc.givenName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                projectDocuments: prev.projectDocuments.filter((_, i) => i !== index)
                              }));
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Project Links */}
              <div className="space-y-2">
                <Label className="dark:text-slate-200">Project Links</Label>
                <ProjectLinkSelector
                  selectedSolutions={formData.solutionName}
                  disableSolutionFilter={true}
                  onLinkSelect={(link: any) => {
                    if (!projectLinks.find((l: any) => l.url === link.url)) {
                      setProjectLinks(prev => [...prev, link]);
                      setFormData(prev => ({
                        ...prev,
                        projectLinks: [...prev.projectLinks, link]
                      }));
                    }
                  }}
                />
                
                {projectLinks.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <Label className="text-sm font-medium dark:text-slate-200">Selected Links:</Label>
                    <div className="space-y-1">
                      {projectLinks.map((link: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded dark:bg-slate-800">
                          <div>
                            <span className="text-sm font-medium dark:text-slate-200">{link.name}</span>
                            <p className="text-xs text-gray-500 dark:text-slate-400">{link.url}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newLinks = projectLinks.filter((_, i) => i !== index);
                              setProjectLinks(newLinks);
                              setFormData(prev => ({
                                ...prev,
                                projectLinks: newLinks
                              }));
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </GuidedFormSection>

          {/* Section 8: Validation Criteria (Purple) */}
          <GuidedFormSection
            id="section-validation"
            stepNumber={8}
            title="Validation Criteria"
            icon={<CircleCheckBig className="h-5 w-5" />}
            isOpen={openSections.validation}
            onToggle={() => toggleSection('validation')}
            completedFields={getSectionCompletion.validation.completed}
            totalRequiredFields={getSectionCompletion.validation.total}
            color="brand"
            description="Define success criteria and validation templates"
          >
            <div className="space-y-4">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 cursor-help">
                          <Blocks className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                          <label className="block text-sm font-medium cursor-help dark:text-slate-200">
                            Apply Validation Criteria Template (Optional)
                          </label>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p>Select a Validation Criteria Template to populate criteria. You can edit the criteria after applying — edits are tracked with an [Edited] indicator.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedVCTemplateId?.toString() || ""}
                    onValueChange={(value) => {
                      if (!value) {
                        setSelectedVCTemplateId(null);
                        setOriginalVCCriteria("");
                        return;
                      }
                      const id = parseInt(value);
                      if (successCriteria.length > 0) {
                        setPendingVCTemplateId(id);
                        setIsVCTemplateConfirmOpen(true);
                      } else {
                        setOriginalVCCriteria("");
                        setSelectedVCTemplateId(id);
                      }
                    }}
                  >
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredVCTemplates.map((t: any) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          <div className="flex items-center gap-2">
                            <DynamicIcon name={t.icon || "LayoutTemplate"} className="h-4 w-4" />
                            <span>{t.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isVCTemplateEdited && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">[Edited]</span>
                  )}
                  {vcTemplateLoading && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Loading...</span>
                  )}
                  {selectedVCTemplateId && !vcTemplateLoading && (
                    <Button variant="ghost" size="sm" className="text-xs h-7 px-2" asChild>
                      <a href="/templates?tab=validation-criteria" target="_blank" rel="noopener noreferrer">
                        Edit Template
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              <SuccessCriteriaForm
                criteria={successCriteria}
                onChange={setSuccessCriteria}
                selectedSolutions={formData.solutionName}
              />
            </div>

            <AlertDialog open={isVCTemplateConfirmOpen} onOpenChange={setIsVCTemplateConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Replace Validation Criteria?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will replace the current validation criteria with those from the selected template. Any existing criteria will be overwritten.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setPendingVCTemplateId(null)}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    if (pendingVCTemplateId) {
                      setOriginalVCCriteria("");
                      setSelectedVCTemplateId(pendingVCTemplateId);
                      setPendingVCTemplateId(null);
                    }
                    setIsVCTemplateConfirmOpen(false);
                  }}>
                    Replace Criteria
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </GuidedFormSection>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
