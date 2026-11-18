import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import { ProjectForm } from "@/components/project-form/project-form";
import type {
  FormData as ProjectFormFields,
  ProjectFormSubmitData,
  ProjectFormInitialData,
} from "@/components/project-form/types";
import { SuccessCriteriaForm } from "@/components/validation-criteria/success-criteria-form";
import type { SuccessCriteria as FormSuccessCriteria } from "@/components/validation-criteria/success-criteria-types";
type SuccessCriteria = FormSuccessCriteria;
import { MapTemplateSelector } from "@/components/project-form/MapTemplateSelector";
import { GuidedFormSection } from "@/components/project-form/GuidedFormSection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Check, File, Link, FileText, Trash2, FolderCog, CalendarHeart, CalendarArrowUp, CalendarArrowDown, CalendarClock, CalendarX, CircleCheckBig, History, ShieldCheck } from "lucide-react";
import { AssumptionsDependenciesTab, type SuccessCriterion as DepSuccessCriterion, type Product as DepProduct } from "@/components/project-detail/AssumptionsDependenciesTab";
import { AuditHistoryDrawer } from "@/components/project-detail/audit-history-drawer";
import { TAPDrawer, TAPButton } from "@/components/project-detail/TAPDrawer";
import { JourneyStageTrack } from "@/components/value-journey/JourneyStageTrack";
import { ProjectNavigatorDrawer } from "@/components/projects/project-navigator-drawer";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { InsertPoc, PocWithRelations, type User, type RiskLevelConfig, type StatusConfig } from "@shared/schema";
import type { ConnectedCompetitorItem } from "@/components/project-form/EssentialsSection";
import { redirectToSignIn } from "@/lib/sign-in-redirect";
type ProjectFormData = InsertPoc & { projectCompetingWith?: ConnectedCompetitorItem[] };

/**
 * Payload accepted by the project update mutation. The PUT `/api/projects/:id`
 * handler tolerates the extra fields the form emits (uploaded files, project
 * links, map template id, etc.) alongside the canonical InsertPoc shape.
 */
type ProjectUpdatePayload = ProjectFormSubmitData & {
  id?: number;
};

/**
 * The `/api/projects/:id` endpoint returns a `PocWithRelations` augmented
 * with denormalized scalar id columns and a flat `customer` relation that
 * are not part of the canonical schema type. This local extension surfaces
 * the runtime fields the edit page actually consumes so we can avoid `any`
 * casts on the `project` object.
 */
type ProjectWithExtras = PocWithRelations & {
  primarySeId?: string | null;
  specialistSeId?: string | null;
  accountRepresentativeId?: string | null;
  opportunityEngineerId?: string | null;
  supportingSes?: Array<string | { id: string | number }> | null;
  customer?: { name?: string | null } | null;
  opportunityEngineer?: { id?: string | number } | null;
};

interface CustomerStatusConfig {
  id: number;
  name: string;
  color: string;
  icon?: string;
}

interface EditProjectProps {
  params: { id: string };
}

/**
 * Coerce a `Date | string | null | undefined` value into the ISO date
 * string (`YYYY-MM-DD`) the form's date inputs expect, returning
 * `undefined` when the source value is missing.
 */
function toFormDateString(
  value: Date | string | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString().split("T")[0];
  }
  return String(value).split("T")[0];
}

/**
 * Build a strict `Partial<FormData>` initial-data payload from the
 * persisted project record returned by `/api/projects/:id`. Each
 * conversion is explicit so the form never sees a value whose runtime
 * shape differs from its schema (Date vs string, number vs string id,
 * raw JSONB vs typed array).
 */
function toProjectFormInitialData(
  project: ProjectWithExtras,
  resolveSolutionName: (raw: unknown) => string,
): ProjectFormInitialData {
  const solutionName = resolveSolutionName(project.solutionName)
    .split(", ")
    .filter((s) => s.length > 0);

  const primarySe = project.primarySeId
    ? String(project.primarySeId)
    : project.primarySe?.id
      ? String(project.primarySe.id)
      : "";
  const specialistSe = project.specialistSeId
    ? String(project.specialistSeId)
    : project.specialistSe?.id
      ? String(project.specialistSe.id)
      : "";
  const accountRepresentative = project.accountRepresentativeId
    ? String(project.accountRepresentativeId)
    : project.accountRepresentative?.id
      ? String(project.accountRepresentative.id)
      : "";
  const opportunityEngineer = project.opportunityEngineerId
    ? String(project.opportunityEngineerId)
    : project.opportunityEngineer?.id
      ? String(project.opportunityEngineer.id)
      : "";
  const supportingSalesEngineers = project.supportingSes
    ? project.supportingSes.map((se) =>
        typeof se === "string" ? se : String(se.id),
      )
    : [];

  const customerUsers: ProjectFormFields["customerUsers"] = Array.isArray(
    project.customerUsers,
  )
    ? (project.customerUsers as ProjectFormFields["customerUsers"])
    : undefined;
  const additionalAccess: ProjectFormFields["additionalAccess"] = Array.isArray(
    project.additionalAccess,
  )
    ? (project.additionalAccess as ProjectFormFields["additionalAccess"])
    : undefined;
  const projectLinks: ProjectFormFields["projectLinks"] = Array.isArray(
    project.projectLinks,
  )
    ? (project.projectLinks as ProjectFormFields["projectLinks"])
    : undefined;

  return {
    id: project.id,
    projectName: project.name ?? undefined,
    customerName: project.customerName ?? undefined,
    businessProblem: project.businessProblem ?? undefined,
    industry: project.industry ?? undefined,
    environment: project.environment ?? undefined,
    type: project.type ?? undefined,
    opportunityName: project.opportunityName ?? undefined,
    salesforceEvaluationLink: project.salesforceEvaluationLink ?? undefined,
    crmProvider: project.crmProvider ?? undefined,
    crmOpportunityId: project.crmOpportunityId ?? undefined,
    crmAccountId: project.crmAccountId ?? undefined,
    infrastructureProfileId: project.infrastructureProfileId ?? null,
    opportunityAcvValue: project.opportunityAcvValue ?? undefined,
    solutionDescription: project.solutionDescription ?? undefined,
    policyConsiderations: project.policyConsiderations ?? undefined,
    notes: project.notes ?? undefined,
    customerObjective: project.customerObjective ?? undefined,
    customerStakeholder: project.customerStakeholder ?? undefined,
    status: project.status ?? undefined,
    customerStatus: project.customerStatus ?? undefined,
    customerAccessLevel: project.customerAccessLevel ?? undefined,
    risk: project.risk ?? undefined,
    ranking: project.ranking ?? undefined,
    // Prefer customerLogoLive (live join from customers.logo_url) over
    // the customerLogo snapshot stored on the project row at creation
    // time. The snapshot frequently points at a since-deleted file for
    // projects created before a logo replacement / asset cleanup; the
    // live URL always reflects the current customer record so the
    // form field matches what the project header banner already shows.
    customerLogo: project.customerLogoLive || project.customerLogo || null,
    tags: project.tags ?? undefined,
    additionalSupportingTeam: project.additionalSupportingTeam ?? undefined,
    complianceRegulations: project.complianceRegulations ?? undefined,
    tccUseProjectUser: project.tccUseProjectUser ?? undefined,
    tccUserId: project.tccUserId ?? undefined,
    tccFirstName: project.tccFirstName ?? undefined,
    tccLastName: project.tccLastName ?? undefined,
    tccCommitteeApproval: project.tccCommitteeApproval ?? undefined,
    startDate: toFormDateString(project.startDate),
    endDate: toFormDateString(project.endDate),
    solutionName,
    primarySe,
    specialistSe,
    supportingSalesEngineers,
    accountRepresentative,
    opportunityEngineer,
    customerUsers,
    additionalAccess,
    projectLinks,
  };
}

export default function EditProject({ params }: EditProjectProps) {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const projectId = parseInt(params.id);
  const [successCriteria, setSuccessCriteria] = useState<Partial<FormSuccessCriteria>[]>([]);
  const [currentSolutions, setCurrentSolutions] = useState<string[]>([]);
  
  const [isTAPDrawerOpen, setIsTAPDrawerOpen] = useState(false);

  // MAP Template Selector State
  const [isMapTemplateSelectorOpen, setIsMapTemplateSelectorOpen] = useState(false);
  const [selectedMapTemplate, setSelectedMapTemplate] = useState<{ id: number; name: string; description?: string; phaseCount?: number; stepCount?: number; taskCount?: number } | null>(null);
  
  // Validation section open/close state
  const [isValidationSectionOpen, setIsValidationSectionOpen] = useState(false);

  // Assumptions & Dependencies section open/close state
  const [isAssumptionsSectionOpen, setIsAssumptionsSectionOpen] = useState(false);
  
  // Audit History Drawer state
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  
  // Project Navigator Drawer state
  const [isProjectNavigatorOpen, setIsProjectNavigatorOpen] = useState(false);

  // Function to remove success criteria by solution name
  const handleRemoveSolutionCriteria = async (solutionName: string) => {
    // Remove from local state first
    setSuccessCriteria(prev => prev.filter(criteria => criteria.productName !== solutionName));
    
    // Remove from database via API
    if (project?.successCriteria) {
      const criteriaToRemove = project.successCriteria.filter(criteria => criteria.productName === solutionName);
      
      if (criteriaToRemove.length > 0) {
        for (const criteria of criteriaToRemove) {
          try {
            await apiRequest("DELETE", `/api/success-criteria/${criteria.id}`);
          } catch (error) {
            console.error("Failed to delete criteria:", criteria.id, error);
            throw error; // Re-throw to handle in the component
          }
        }
        
        // Refresh project data to ensure consistency
        await queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      }
    }
  };

  // Fetch all products/solutions for AssumptionsDependenciesTab
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
  });

  // Fetch status configurations for consistent colors
  const { data: statusConfigs = [] } = useQuery<StatusConfig[]>({
    queryKey: ["/api/status-configs"],
    enabled: isAuthenticated,
  });

  // Fetch customer status configurations
  const { data: customerStatusConfigs = [] } = useQuery<CustomerStatusConfig[]>({
    queryKey: ["/api/customer-status-configs"],
    enabled: isAuthenticated,
  });

  // Fetch risk level configurations for consistent colors and icons
  const { data: riskLevelConfigs = [] } = useQuery<RiskLevelConfig[]>({
    queryKey: ["/api/risk-level-configs"],
    enabled: isAuthenticated,
  });

  // Helper function to format solution name properly
  const formatSolutionName = (solutionName: unknown): string => {
    if (!solutionName) return '';
    
    if (Array.isArray(solutionName)) {
      return solutionName.join(', ');
    }
    
    if (typeof solutionName === 'string') {
      if (solutionName.startsWith('{')) {
        try {
          // Handle nested JSON strings
          let parsed = JSON.parse(solutionName);
          while (typeof parsed === 'string' && parsed.startsWith('{')) {
            parsed = JSON.parse(parsed);
          }
          if (Array.isArray(parsed)) {
            return parsed.join(', ');
          }
          // Extract readable values using regex if complex nested JSON
          const matches = solutionName.match(/([A-Za-z\s]+(?:Classification|Auditor|Manager|Protection|Analytics))/g);
          return matches ? matches.join(', ') : 'Multiple Solutions';
        } catch (e) {
          // Extract readable values using regex if JSON parsing fails
          const matches = solutionName.match(/([A-Za-z\s]+(?:Classification|Auditor|Manager|Protection|Analytics))/g);
          return matches ? matches.join(', ') : solutionName;
        }
      }
      return solutionName;
    }
    
    return String(solutionName);
  };

  // Get ranking icon and color
  const getRankingIcon = (ranking: string) => {
    switch (ranking) {
      case "In Quarter":
        return { icon: CalendarHeart, color: "text-green-600" };
      case "Upside":
        return { icon: CalendarArrowUp, color: "text-blue-600" };
      case "Stretch":
        return { icon: CalendarArrowDown, color: "text-yellow-600" };
      case "Out Quarter":
        return { icon: CalendarClock, color: "text-orange-600" };
      case "Burn it Down":
        return { icon: CalendarX, color: "text-red-600" };
      default:
        return { icon: CalendarHeart, color: "text-green-600" };
    }
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToSignIn();
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  // Fetch Project data
  const { data: project, isLoading, error } = useQuery<ProjectWithExtras>({
    queryKey: [`/api/projects/${projectId}`],
    retry: false,
    enabled: isAuthenticated && !isNaN(projectId),
  });

  // Fetch MAP data to determine if this is a MAP project
  const { data: mapData } = useQuery<{
    phases?: unknown[];
    templateInfo?: {
      id: number;
      name: string;
      description?: string;
      phaseCount?: number;
      stepCount?: number;
      taskCount?: number;
    } | null;
  } | null>({
    queryKey: [`/api/projects/${projectId}/map`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/map`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch project MAP data');
      }
      return response.json();
    },
    enabled: isAuthenticated && projectId !== null,
  });

  // Fetch project dependencies to show count on Validation Criteria section
  const { data: projectDependencies = [] } = useQuery<{ id: number; showOnSuccessCriteria?: boolean; successCriteriaId?: number | null; successCriteriaIds?: number[] | null }[]>({
    queryKey: [`/api/project-dependencies`, { projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/project-dependencies?projectId=${projectId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated && !isNaN(projectId),
  });
  const validationDependencyCount = projectDependencies.filter(d =>
    (d.successCriteriaIds && d.successCriteriaIds.length > 0) || d.successCriteriaId != null
  ).length;

  // Fetch creator user data
  const { data: creatorUser } = useQuery<User | null>({
    queryKey: [`/api/users/${project?.createdBy}`],
    enabled: isAuthenticated && !!project?.createdBy,
  });

  // Local state for editable fields in Project Overview (for immediate UI feedback)
  const [localRisk, setLocalRisk] = useState<string>("None");
  const [localRanking, setLocalRanking] = useState<string>("In Quarter");
  const [localStatus, setLocalStatus] = useState<string>("planning");
  const [localCustomerStatus, setLocalCustomerStatus] = useState<string>("On Time");

  // Sync local state with project data when it loads or changes
  useEffect(() => {
    if (project) {
      setLocalRisk(project.risk || "None");
      setLocalRanking(project.ranking || "In Quarter");
      setLocalStatus(project.status || "planning");
      setLocalCustomerStatus(project.customerStatus || "On Time");
    }
  }, [project?.risk, project?.ranking, project?.status, project?.customerStatus]);

  // Load success criteria and solutions when Project data is loaded
  useEffect(() => {
    console.log("Project data loaded:", project);
    if (project) {
      console.log("Project successCriteria:", project.successCriteria);
      console.log("Project customerAccess:", project.customerAccess);
      console.log("Project additionalAccess:", project.additionalAccess);
      if (project.successCriteria && project.successCriteria.length > 0) {
        console.log("Loading success criteria:", project.successCriteria);
        setSuccessCriteria(project.successCriteria.map((sc): Partial<FormSuccessCriteria> => ({
          id: sc.id,
          criterion: sc.criterion ?? "",
          expectedOutcome: sc.expectedOutcome ?? "",
          actionItem: sc.actionItem ?? "",
          status: sc.status ?? "",
          productName: sc.productName ?? "",
          notes: sc.notes ?? undefined,
          isActive: sc.isActive !== false,
          lineNumber: sc.lineNumber,
          componentName: sc.componentName ?? "",
          valueMappingName: sc.valueMappingName ?? null,
          // Map text values to IDs for the hierarchical component
          criteriaId: sc.criterion ? 1 : null, // We'll need to improve this mapping
          expectedOutcomeId: sc.expectedOutcome ? 1 : null,
          actionItemId: sc.actionItem ? 1 : null,
        })));
      } else {
        console.log("No success criteria found in Project data");
        setSuccessCriteria([]);
      }
      
      // Initialize current solutions from project data
      if (project.solutionName) {
        let parsedSolutions: string[] = [];
        try {
          if (typeof project.solutionName === 'string') {
            if (project.solutionName.startsWith('{') && project.solutionName.endsWith('}')) {
              // Handle PostgreSQL array format: {"Acme Data Classification","Acme Auditor"}
              const content = project.solutionName.slice(1, -1);
              parsedSolutions = content.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
            } else {
              // Handle single string or comma-separated string
              parsedSolutions = project.solutionName.split(',').map(s => s.trim());
            }
          } else if (Array.isArray(project.solutionName)) {
            parsedSolutions = project.solutionName;
          }
        } catch (e) {
          console.error("Error parsing solutions:", e);
          parsedSolutions = project.solutionName ? [String(project.solutionName)] : [];
        }
        console.log("Initialized current solutions:", parsedSolutions);
        setCurrentSolutions(parsedSolutions);
      } else {
        setCurrentSolutions([]);
      }
    }
  }, [project]);

  // Handle solutions change from ProjectForm.
  //
  // Memoized so the prop identity stays stable across renders — pairs
  // with the lastReportedRef value-guard inside ProjectForm's
  // useEffect. Without `useCallback` the inline function was a new
  // identity per render, which combined with `form.watch()` returning
  // a fresh array reference each render produced the React #185
  // "Maximum update depth exceeded" loop seen on /create
  // (err_1781199450117_hoph2y487). Edit-project hadn't crashed in the
  // wild yet but had the exact same vulnerability shape.
  const handleSolutionsChange = useCallback((solutions: string[]) => {
    setCurrentSolutions(solutions);
  }, []);

  // Populate selectedMapTemplate when MAP data is loaded
  useEffect(() => {
    if (mapData?.templateInfo) {
      setSelectedMapTemplate(mapData.templateInfo);
    } else {
      setSelectedMapTemplate(null);
    }
  }, [mapData]);

  // Handle MAP template removal
  const handleRemoveMapTemplate = () => {
    setSelectedMapTemplate(null);
    toast({
      title: "MAP Template Removed",
      description: "The MAP template has been removed from this project.",
    });
  };

  // Update Project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (projectData: ProjectUpdatePayload) => {
      return apiRequest("PUT", `/api/projects/${projectId}`, projectData);
    },
    onSuccess: async (response, projectData) => {
      console.log("Response object:", response);
      
      // Handle both direct objects and Response objects
      let updatedProject;
      if (response && typeof response.json === 'function') {
        updatedProject = await response.json();
      } else {
        updatedProject = response;
      }
      
      console.log("Project saved successfully:", updatedProject);
      console.log("Saving success criteria:", successCriteria);
      
      try {
        // Get original success criteria IDs from Project data
        const originalCriteriaIds = project?.successCriteria?.map(sc => sc.id) || [];
        const currentCriteriaIds = successCriteria.filter(sc => sc.id).map(sc => sc.id);
        
        // Find criteria that were deleted (exist in original but not in current)
        const deletedCriteriaIds = originalCriteriaIds.filter(id => !currentCriteriaIds.includes(id));
        
        console.log("Original criteria IDs:", originalCriteriaIds);
        console.log("Current criteria IDs:", currentCriteriaIds);
        console.log("Deleted criteria IDs:", deletedCriteriaIds);
        
        // Delete removed criteria
        for (const deletedId of deletedCriteriaIds) {
          console.log("Deleting criteria with ID:", deletedId);
          await apiRequest("DELETE", `/api/success-criteria/${deletedId}`);
        }
        
        // Update success criteria
        for (const criteria of successCriteria) {
          console.log("Processing criteria:", criteria);
          if (criteria.criterion || criteria.criteriaId) {
            console.log("Criteria has criterion, proceeding to save:", criteria.criterion);
            if (criteria.id) {
              // Update existing criteria
              console.log("Updating existing criteria with ID:", criteria.id);
              await apiRequest("PUT", `/api/success-criteria/${criteria.id}`, {
                criterion: criteria.criterion,
                expectedOutcome: criteria.expectedOutcome,
                actionItem: criteria.actionItem,
                status: criteria.status || "pending",
                priority: criteria.priority ?? "must_have",
                productName: criteria.productName,
                componentId: criteria.componentId ?? null,
                componentName: criteria.componentName ?? null,
                valueMappingId: criteria.valueMappingId ?? null,
                valueMappingName: criteria.valueMappingName ?? null,
                notes: criteria.notes || null,
                isActive: criteria.isActive !== false,
              });
            } else {
              // Create new criteria
              console.log("Creating new criteria for Project:", updatedProject.id);
              console.log("Original projectId from URL:", projectId);
              
              // Use projectId from URL if updatedProject.id is undefined
              const finalProjectId = updatedProject.id || projectId;
              console.log("Final projectId to use:", finalProjectId);
              
              // Ensure projectId is a number
              const numericProjectId = typeof finalProjectId === 'string' ? parseInt(finalProjectId) : finalProjectId;
              console.log("Numeric projectId:", numericProjectId);
              
              const requestData = {
                projectId: numericProjectId,
                criterion: criteria.criterion,
                expectedOutcome: criteria.expectedOutcome,
                actionItem: criteria.actionItem,
                status: criteria.status || "pending",
                priority: criteria.priority ?? "must_have",
                productName: criteria.productName,
                componentId: criteria.componentId ?? null,
                componentName: criteria.componentName ?? null,
                valueMappingId: criteria.valueMappingId ?? null,
                valueMappingName: criteria.valueMappingName ?? null,
                notes: criteria.notes || null,
                isActive: criteria.isActive !== false,
              };
              console.log("Request data:", requestData);
              await apiRequest("POST", "/api/success-criteria", requestData);
            }
          } else {
            console.log("Criteria has no criterion, skipping:", criteria);
          }
        }

        // Sync project competitors ("Competing With")
        const competingWith = projectData.projectCompetingWith;
        if (Array.isArray(competingWith)) {
          try {
            const syncRes = await fetch(`/api/project-competitors/sync/${projectId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ projectCompetitors: competingWith }),
            });
            if (!syncRes.ok) {
              console.error("Project competitors sync failed:", await syncRes.text());
            }
          } catch (compError) {
            console.error("Project competitors sync error:", compError);
          }
        }

        // Invalidate cache and refresh data
        await queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
        await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/customer-access"] });
        
        // Show success message
        showSuccessToast("Success", "Project updated successfully!");
        
      } catch (error) {
        console.error("Error in success criteria handling:", error);
        showWarningToast("Warning", "Project saved but there was an issue with success criteria.");
      } finally {
        // Always reset submission flags
        setTriggerSubmit(0);
        setIsSubmitting(false);
        
        // Reset form submission flag in the form component
        if (formRef.current && formRef.current.setIsFormSubmitting) {
          console.log("Resetting form submission flag after successful save");
          formRef.current.setIsFormSubmitting(false);
        }
      }
    },
    onError: (error) => {
      console.error("Update project mutation error:", error);
      
      // Rollback local state to project values on error
      if (project) {
        setLocalRisk(project.risk || "None");
        setLocalRanking(project.ranking || "In Quarter");
        setLocalStatus(project.status || "planning");
      }
      
      // Always reset submission flags
      setIsSubmitting(false);
      setTriggerSubmit(0);
      
      // Reset form submission flag in the form component
      if (formRef.current && formRef.current.setIsFormSubmitting) {
        formRef.current.setIsFormSubmitting(false);
      }
      
      if (isUnauthorizedError(error)) {
        redirectToSignIn();
        return;
      }
      
      // Provide more detailed error information if available
      const errorMessage = error?.message || error?.toString() || "Failed to update project.";
      showErrorToast("Error", errorMessage);
    },
  });

  // Silent partial-field update — used by the inline Risk / Ranking / Status / Customer
  // Status selects in the GuidedOverviewBanner.  These are auto-saves on user selection;
  // they do not need a full-form success toast, success-criteria processing, or user
  // invalidation.  Keeping them separate prevents both the spurious "Project updated
  // successfully!" toast and the users-refetch → initialization-effect → render loop.
  const updateFieldMutation = useMutation({
    mutationFn: async (data: Partial<ProjectFormData>) =>
      apiRequest("PUT", `/api/projects/${projectId}`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error) => {
      if (project) {
        setLocalRisk(project.risk || "None");
        setLocalRanking(project.ranking || "In Quarter");
        setLocalStatus(project.status || "planning");
        setLocalCustomerStatus(project.customerStatus || "On Time");
      }
      const errorMessage = error?.message || "Failed to update field.";
      showErrorToast("Error", errorMessage);
    },
  });

  const [triggerSubmit, setTriggerSubmit] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete project confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Ref to access form component methods
  const formRef = useRef<any>(null);

  const handleFormSubmit = (formData: ProjectFormSubmitData) => {
    if (isSubmitting) {
      console.log("Form is already being submitted, ignoring duplicate submission");
      return;
    }
    
    console.log("=== FORM SUBMISSION DEBUG ===");
    console.log("handleFormSubmit called with data:", formData);
    
    try {
      // `ProjectUpdatePayload` is the form's submit payload widened with
      // the projectId and the optional `projectCompetingWith` array; both
      // are tolerated by the PUT `/api/projects/:id` handler.
      const pocData: ProjectUpdatePayload = {
        ...formData,
        id: projectId,
        opportunityAcvValue: formData.opportunityAcvValue || "",
        startDate: formData.startDate,
        endDate: formData.endDate,
      };

      console.log("About to call updateProjectMutation.mutate with data:", pocData);
      setIsSubmitting(true);
      updateProjectMutation.mutate(pocData);
    } catch (error) {
      console.error("Error in handleFormSubmit:", error);
      setIsSubmitting(false);
      showErrorToast("Error", "Failed to prepare project data for submission.");
    }
  };

  const handleTopButtonClick = () => {
    console.log("=== SAVE BUTTON CLICKED ===");
    console.log("Top button clicked, triggering form submit");
    // Use a timestamp to ensure trigger is always different
    setTriggerSubmit(Date.now());
  };

  const copyProjectUrl = () => {
    const projectUrl = `${window.location.origin}/project/${projectId}`;
    navigator.clipboard.writeText(projectUrl).then(() => {
      showSuccessToast("URL Copied", "Project URL copied to clipboard");
    }).catch(() => {
      showErrorToast("Copy Failed", "Failed to copy URL to clipboard");
    });
  };

  // Duplicate project mutation. The payload merges fields from the source
  // project (a `PocWithRelations`) directly into the create-project request,
  // so it's a structural superset of `Partial<ProjectFormData>` (e.g. it
  // carries User[] / object shapes for support engineers that the server
  // accepts and normalizes).
  const duplicateProjectMutation = useMutation({
    mutationFn: async (duplicateData: Record<string, unknown>) => {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(duplicateData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create duplicate project');
      }
      
      return response.json();
    },
    onSuccess: async (newProject) => {
      // Copy success criteria if they exist
      if (successCriteria && successCriteria.length > 0) {
        for (const criteria of successCriteria) {
          await fetch("/api/success-criteria", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              projectId: newProject.id,
              productName: criteria.productName,
              criterion: criteria.criterion,
              expectedOutcome: criteria.expectedOutcome,
              actionItem: criteria.actionItem,
              status: 'pending', // Reset status for duplicate
              priority: criteria.priority ?? 'must_have',
              notes: criteria.notes
            }),
          });
        }
      }
      
      showSuccessToast("Project Duplicated", `New project created with ID ${newProject.id}`);
      
      // Navigate to the new project's edit page
      setLocation(`/edit-project/${newProject.id}`);
    },
    onError: (error) => {
      console.error('Duplicate project error:', error);
      showErrorToast("Error", "Failed to duplicate project");
    }
  });

  const duplicateProject = () => {
    if (!project) return;
    
    // Create the duplicate project data
    const duplicateData = {
      customerName: project.customerName,
      businessProblem: project.businessProblem,
      solutionName: project.solutionName,
      solutionDescription: project.solutionDescription,
      industry: project.industry,
      environment: project.environment,
      type: project.type,
      salesforceEvaluationLink: project.salesforceEvaluationLink,
      opportunityAcvValue: project.opportunityAcvValue,
      policyConsiderations: project.policyConsiderations,
      notes: project.notes,
      customerObjective: project.customerObjective,
      customerStakeholder: project.customerStakeholder,
      primarySeId: project.primarySeId,
      specialistSeId: project.specialistSeId,
      supportingSalesEngineers: project.supportingSalesEngineers,
      startDate: project.startDate,
      endDate: project.endDate,
      risk: project.risk,
      ranking: project.ranking,
      tags: project.tags,
      customerAccessLevel: project.customerAccessLevel,
      status: 'planning', // Reset status to planning for new duplicate
      customerLogo: project.customerLogo // Include customer logo
    };

    duplicateProjectMutation.mutate(duplicateData);
  };

  const deleteProject = () => {
    if (!project) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteProject = async () => {
    if (!project) return;
    
    try {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
      
      // Invalidate projects query cache to remove archived project from lists
      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      
      showSuccessToast("Success", "Project deleted successfully");
      setLocation('/');
    } catch (error) {
      showErrorToast("Error", error instanceof Error ? error.message : "Failed to delete project");
    }
  };

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Project Not Found</h2>
          <p className="text-gray-600 mb-4">The project you're looking for doesn't exist.</p>
          <Button onClick={() => setLocation("/")}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading Project...</div>;
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Project Not Found</h2>
          <p className="text-gray-600 mb-4">The project you're looking for doesn't exist.</p>
          <Button onClick={() => setLocation("/")}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      
      <div className="pb-6 pt-0 h-full">
        <div className="mx-auto h-full" style={{ width: "96%" }}>
          <div className="mb-4">
            <JourneyStageTrack projectId={projectId} variant="banner" />
          </div>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FolderCog className="h-6 w-6 text-blue-600" />
                    <TooltipProvider>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setIsProjectNavigatorOpen(true)}
                            className="hover:text-blue-600 hover:underline transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                          >
                            Edit Project: ID# {projectId}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>Click to browse all projects</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {(() => {
                      // The plan is a MAP: named after its template, a Quick plan without one.
                      const hasMapData = mapData?.phases && mapData.phases.length > 0;
                      const templateName = mapData?.templateInfo?.name || selectedMapTemplate?.name;

                      if (templateName) {
                        return `MAP - ${templateName}`;
                      } else if (hasMapData) {
                        return 'MAP - Quick plan';
                      } else {
                        return 'Not Defined';
                      }
                    })()}
                    {' • '}
                    Created Date: {project?.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
                    {' • '}
                    Last Updated: {project?.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'N/A'}
                    {' • '}
                    Created By: {creatorUser ? `${creatorUser.firstName || ''} ${creatorUser.lastName || ''}`.trim() || creatorUser.email : 'N/A'}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip delayDuration={2000}>
                      <TooltipTrigger asChild>
                        <Button 
                          onClick={copyProjectUrl}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Copy project URL</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip delayDuration={2000}>
                      <TooltipTrigger asChild>
                        <Button 
                          onClick={duplicateProject}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Duplicate project</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip delayDuration={2000}>
                      <TooltipTrigger asChild>
                        <Button 
                          onClick={deleteProject}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete project</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button 
                    onClick={(e) => {
                      console.log("Button click event triggered!", e);
                      handleTopButtonClick();
                    }} 
                    disabled={updateProjectMutation.isPending}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="space-y-4">
                <ProjectForm 
                  ref={formRef}
                  onSubmit={handleFormSubmit} 
                  initialData={project ? (() => {
                    const initialData = toProjectFormInitialData(
                      project,
                      formatSolutionName,
                    );
                    console.log("=== INITIAL DATA DEBUG ===");
                    console.log("Raw Project data:", project);
                    console.log("project.primarySeId:", project.primarySeId);
                    console.log("project.primarySe:", project.primarySe);
                    console.log("project.specialistSeId:", project.specialistSeId);
                    console.log("project.specialistSe:", project.specialistSe);
                    console.log("project.supportingSes:", project.supportingSes);
                    console.log("Final initialData engineer fields:", {
                      primarySe: initialData?.primarySe,
                      specialistSe: initialData?.specialistSe,
                      supportingSalesEngineers: initialData?.supportingSalesEngineers,
                    });
                    return initialData;
                  })() : undefined}
                  isEdit={true}
                  triggerSubmit={triggerSubmit}
                  onSolutionChange={handleSolutionsChange}
                  existingSuccessCriteria={project?.successCriteria || []}
                  onRemoveSolutionCriteria={handleRemoveSolutionCriteria}
                  selectedMapTemplate={selectedMapTemplate}
                  handleRemoveMapTemplate={handleRemoveMapTemplate}
                  setIsMapTemplateSelectorOpen={setIsMapTemplateSelectorOpen}
                  projectId={projectId}
                  editModeControls={
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium text-gray-700 dark:text-slate-300">Tech Risk:</Label>
                        <Select 
                          value={localRisk} 
                          onValueChange={(value) => {
                            // Radix reports "" when the page's form resets on load; only a
                            // real pick saves (an empty save also bumped Last Updated).
                            if (!value || value === localRisk) return;
                            setLocalRisk(value);
                            updateFieldMutation.mutate({ risk: value });
                          }}
                        >
                          <SelectTrigger className="w-[120px] h-8">
                            <SelectValue>
                              {(() => {
                                const currentConfig = riskLevelConfigs.find((config) =>
                                  config.name.toLowerCase() === localRisk?.toLowerCase()
                                );
                                if (currentConfig) {
                                  return (
                                    <div className="flex items-center gap-2">
                                      {currentConfig.icon ? (
                                        <DynamicIcon 
                                          name={currentConfig.icon} 
                                          className="h-4 w-4" 
                                          style={{ color: currentConfig.color }}
                                        />
                                      ) : (
                                        <div 
                                          className="w-3 h-3 rounded-full" 
                                          style={{ backgroundColor: currentConfig.color }}
                                        />
                                      )}
                                      <span>{currentConfig.name}</span>
                                    </div>
                                  );
                                }
                                // Capitalize first letter for fallback display
                                const formattedRisk = localRisk
                                  ? localRisk.charAt(0).toUpperCase() + localRisk.slice(1)
                                  : '';
                                return formattedRisk;
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {riskLevelConfigs.map((config) => (
                              <SelectItem key={config.id} value={config.name}>
                                <div className="flex items-center gap-2">
                                  {config.icon ? (
                                    <DynamicIcon 
                                      name={config.icon} 
                                      className="h-4 w-4" 
                                      style={{ color: config.color }}
                                    />
                                  ) : (
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: config.color }}
                                    />
                                  )}
                                  {config.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium text-gray-700 dark:text-slate-300">MGMT Ranking:</Label>
                        <Select 
                          value={localRanking} 
                          onValueChange={(value) => {
                            // Radix reports "" when the page's form resets on load; only a
                            // real pick saves (an empty save also bumped Last Updated).
                            if (!value || value === localRanking) return;
                            setLocalRanking(value);
                            updateFieldMutation.mutate({ ranking: value });
                          }}
                        >
                          <SelectTrigger className="w-[160px] h-8">
                            <SelectValue>
                              {(() => {
                                const { icon: Icon, color } = getRankingIcon(localRanking);
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <Icon className={`h-4 w-4 ${color}`} />
                                    <span>{localRanking}</span>
                                  </div>
                                );
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="In Quarter">
                              <div className="flex items-center gap-1.5">
                                <CalendarHeart className="h-4 w-4 text-green-600" />
                                <span>In Quarter</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Upside">
                              <div className="flex items-center gap-1.5">
                                <CalendarArrowUp className="h-4 w-4 text-blue-600" />
                                <span>Upside</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Stretch">
                              <div className="flex items-center gap-1.5">
                                <CalendarArrowDown className="h-4 w-4 text-yellow-600" />
                                <span>Stretch</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Out Quarter">
                              <div className="flex items-center gap-1.5">
                                <CalendarClock className="h-4 w-4 text-orange-600" />
                                <span>Out Quarter</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Burn it Down">
                              <div className="flex items-center gap-1.5">
                                <CalendarX className="h-4 w-4 text-red-600" />
                                <span>Burn it Down</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap">Internal Project Status:</Label>
                        <Select 
                          value={(() => {
                            const cfg = statusConfigs.find((c) =>
                              c.name.toLowerCase() === localStatus?.toLowerCase()
                            );
                            return cfg?.name ?? localStatus;
                          })()}
                          onValueChange={(value) => {
                            // Radix reports "" when the page's form resets on load; only a
                            // real pick saves (an empty save also bumped Last Updated).
                            if (!value || value === localStatus) return;
                            setLocalStatus(value);
                            updateFieldMutation.mutate({ status: value });
                          }}
                        >
                          <SelectTrigger className="h-8 w-auto min-w-[160px] gap-2 whitespace-nowrap [&>span]:line-clamp-none" data-testid="select-internal-status">
                            <SelectValue>
                              {(() => {
                                const currentConfig = statusConfigs.find((config) =>
                                  config.name.toLowerCase() === localStatus?.toLowerCase()
                                );
                                if (currentConfig) {
                                  return (
                                    <div className="flex items-center gap-2">
                                      {currentConfig.icon ? (
                                        <DynamicIcon 
                                          name={currentConfig.icon} 
                                          className="h-4 w-4" 
                                          style={{ color: currentConfig.color }}
                                        />
                                      ) : (
                                        <div 
                                          className="w-3 h-3 rounded-full" 
                                          style={{ backgroundColor: currentConfig.color }}
                                        />
                                      )}
                                      <span>{currentConfig.name}</span>
                                    </div>
                                  );
                                }
                                const formattedStatus = localStatus
                                  ?.split(' ')
                                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                  .join(' ') || '';
                                return formattedStatus;
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {statusConfigs.map((config) => (
                              <SelectItem key={config.id} value={config.name}>
                                <div className="flex items-center gap-2">
                                  {config.icon ? (
                                    <DynamicIcon 
                                      name={config.icon} 
                                      className="h-4 w-4" 
                                      style={{ color: config.color }}
                                    />
                                  ) : (
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: config.color }}
                                    />
                                  )}
                                  {config.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap">Account Status:</Label>
                        <Select
                          value={(() => {
                            const cfg = customerStatusConfigs.find((c) =>
                              c.name.toLowerCase() === localCustomerStatus?.toLowerCase()
                            );
                            return cfg?.name ?? localCustomerStatus;
                          })()}
                          onValueChange={(value) => {
                            // Radix reports "" when the page's form resets on load; only a
                            // real pick saves (an empty save also bumped Last Updated).
                            if (!value || value === localCustomerStatus) return;
                            setLocalCustomerStatus(value);
                            updateFieldMutation.mutate({ customerStatus: value });
                          }}
                        >
                          <SelectTrigger className="h-8 w-auto min-w-[160px] gap-2 whitespace-nowrap [&>span]:line-clamp-none" data-testid="select-account-status">
                            <SelectValue>
                              {(() => {
                                const currentConfig = customerStatusConfigs.find((config) =>
                                  config.name.toLowerCase() === localCustomerStatus?.toLowerCase()
                                );
                                if (currentConfig) {
                                  return (
                                    <div className="flex items-center gap-2">
                                      {currentConfig.icon ? (
                                        <DynamicIcon
                                          name={currentConfig.icon}
                                          className="h-4 w-4"
                                          style={{ color: currentConfig.color }}
                                        />
                                      ) : (
                                        <div
                                          className="w-3 h-3 rounded-full"
                                          style={{ backgroundColor: currentConfig.color }}
                                        />
                                      )}
                                      <span>{currentConfig.name}</span>
                                    </div>
                                  );
                                }
                                return localCustomerStatus;
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {customerStatusConfigs.map((config) => (
                              <SelectItem key={config.id} value={config.name}>
                                <div className="flex items-center gap-2">
                                  {config.icon ? (
                                    <DynamicIcon
                                      name={config.icon}
                                      className="h-4 w-4"
                                      style={{ color: config.color }}
                                    />
                                  ) : (
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: config.color }}
                                    />
                                  )}
                                  {config.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {(() => {
                        const auditCount = Number(project?.auditCount ?? 0);
                        const hasAuditHistory = auditCount > 0;
                        return (
                          <div className="flex items-center gap-1 ml-auto">
                            {user?.role && ["engineer", "admin"].includes(user.role.toLowerCase()) && (
                              <TooltipProvider>
                                <TAPButton
                                  onClick={() => setIsTAPDrawerOpen(true)}
                                  tooltipText={t("projects.manageTable.action.editTap")}
                                  iconOnly
                                />
                              </TooltipProvider>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  type="button"
                                  variant="ghost" 
                                  size="sm"
                                  className={`h-8 w-8 p-0 ${
                                    hasAuditHistory
                                      ? "text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-500 dark:hover:text-orange-400 dark:hover:bg-orange-950"
                                      : "text-gray-600 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800"
                                  }`}
                                  onClick={() => setIsAuditDrawerOpen(true)}
                                  disabled={!hasAuditHistory}
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent 
                                side="top" 
                                className="!bg-white !text-black !text-xs !px-2 !py-1 !border !border-gray-200 !shadow-md !font-normal dark:!bg-gray-900 dark:!text-white dark:!border-gray-700"
                              >
                                View Audit History
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        );
                      })()}
                    </div>
                  }
                  riskLevel={localRisk}
                  riskLevelConfigs={riskLevelConfigs}
                  accountLogoUrl={project.customerLogoLive || project.customerLogo || undefined}
                />

                {/* Section 8: Validation Criteria */}
                <GuidedFormSection
                  id="section-validation"
                  stepNumber={8}
                  title="Validation Criteria"
                  icon={<CircleCheckBig className="h-5 w-5" />}
                  isOpen={isValidationSectionOpen}
                  onToggle={() => setIsValidationSectionOpen(!isValidationSectionOpen)}
                  completedFields={0}
                  totalRequiredFields={0}
                  color="brand"
                  description="Define how success will be measured, including the specific outcomes, tests, and proof points required to validate the solution."
                >
                  <SuccessCriteriaForm
                    criteria={successCriteria}
                    onChange={setSuccessCriteria}
                    selectedSolutions={currentSolutions}
                    showExistingCriteria={true}
                    dependencyCount={validationDependencyCount}
                    projectDependencies={projectDependencies}
                  />
                </GuidedFormSection>

                {/* Section 9: Assumptions & Dependencies */}
                <GuidedFormSection
                  id="section-assumptionsDeps"
                  stepNumber={9}
                  title="Assumptions & Dependencies"
                  icon={<ShieldCheck className="h-5 w-5" />}
                  isOpen={isAssumptionsSectionOpen}
                  onToggle={() => setIsAssumptionsSectionOpen(!isAssumptionsSectionOpen)}
                  completedFields={0}
                  totalRequiredFields={0}
                  color="forest"
                  description="The “physics settings” of the Project. They answer: What must be true, available, or permitted for this to be valid?"
                >
                  {(() => {
                    const rawProducts = Array.isArray(products)
                      ? (products as { id: number; name: string; solutionIcon?: string | null }[])
                      : [];
                    const availableProds: DepProduct[] = rawProducts.map((p) => ({
                      id: p.id,
                      name: p.name,
                      solutionIcon: p.solutionIcon ?? null,
                    }));
                    const solutionNames: string[] = Array.isArray(project?.solutionName)
                      ? project.solutionName
                      : project?.solutionName
                        ? String(project.solutionName).split(", ")
                        : [];
                    const projectProductIds = availableProds
                      .filter((p) => solutionNames.includes(p.name))
                      .map((p) => p.id);
                    const mappedCriteria: DepSuccessCriterion[] = successCriteria
                      .filter((sc): sc is SuccessCriteria & { id: number } => sc.id !== undefined)
                      .map((sc) => ({
                        id: sc.id,
                        name: sc.criterion ?? "",
                        productName: sc.productName ?? null,
                        solutionIcon: null,
                        lineNumber: sc.lineNumber ?? null,
                        criterion: sc.criterion ?? null,
                        componentName: sc.componentName ?? null,
                        valueMappingName: sc.valueMappingName ?? null,
                        expectedOutcome: sc.expectedOutcome ?? null,
                      }));
                    return (
                      <AssumptionsDependenciesTab
                        projectId={projectId}
                        availableProducts={availableProds}
                        projectProductIds={projectProductIds}
                        projectStatus={project?.status ?? undefined}
                        projectSuccessCriteria={mappedCriteria}
                      />
                    );
                  })()}
                </GuidedFormSection>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* MAP Template Selector Dialog */}
      <MapTemplateSelector
        open={isMapTemplateSelectorOpen}
        onOpenChange={setIsMapTemplateSelectorOpen}
        projectId={projectId}
        onTemplateSelected={(template) => {
          if (template) {
            setSelectedMapTemplate(template);
            toast({
              title: "MAP Template Selected",
              description: `Template "${template.name}" has been selected for this project.`,
            });
          }
          setIsMapTemplateSelectorOpen(false);
        }}
      />

      {/* Delete Project Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Project"
        description="Are you sure you want to delete this project? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteProject}
        variant="destructive"
      />

      {/* TAP Drawer */}
      <TAPDrawer
        open={isTAPDrawerOpen}
        onOpenChange={setIsTAPDrawerOpen}
        projectId={projectId}
      />

      {/* Audit History Drawer */}
      <AuditHistoryDrawer
        open={isAuditDrawerOpen}
        onOpenChange={setIsAuditDrawerOpen}
        projectId={projectId}
        projectName={project?.name ?? undefined}
        customerName={project?.customer?.name ?? undefined}
      />

      {/* Project Navigator Drawer */}
      <ProjectNavigatorDrawer
        open={isProjectNavigatorOpen}
        onOpenChange={setIsProjectNavigatorOpen}
        currentProjectId={projectId}
      />
    </div>
  );
}
