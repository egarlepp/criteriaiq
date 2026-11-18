import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useTranslation } from "react-i18next";
import { buildProjectTemplatePayload } from "@/components/templates/project-template-from-project";
import { parseProjectWorkingDays } from "@shared/project-duration";
import { toIsoDate, workingDaysBetween } from "@shared/working-calendar";

import { ProjectForm } from "@/components/project-form/project-form";
import type { ProjectFormSubmitData } from "@/components/project-form/types";
import { formatFullName, capitalizeWords } from "@/lib/nameUtils";
import { SuccessCriteriaForm } from "@/components/validation-criteria/success-criteria-form";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Check,
  UserPlus,
  FilePlus,
  Blocks,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { InsertPoc } from "@shared/schema";
import type { SuccessCriteria } from "@/components/validation-criteria/success-criteria-types";
import type { ConnectedCompetitorItem } from "@/components/project-form/EssentialsSection";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import CreateUserDialog from "@/components/accounts/CreateUserDialog";
import CreateCustomerDialog from "@/components/accounts/CreateCustomerDialog";
import { MapTemplateSelector } from "@/components/project-form/MapTemplateSelector";
import { MapTemplateSummary } from "@/components/project-form/MapTemplateSummary";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { redirectToSignIn } from "@/lib/sign-in-redirect";

type ProjectFormData = InsertPoc & { projectCompetingWith?: ConnectedCompetitorItem[] };

export default function CreateProject() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Drafts mirror persisted rows but allow partial fields while the user is
  // building the form before POSTing to `/api/success-criteria`.
  type DraftSuccessCriteria = Partial<SuccessCriteria>;
  const [successCriteria, setSuccessCriteria] = useState<DraftSuccessCriteria[]>([]);
  const [templateData, setTemplateData] = useState<any>(null);
  const [currentSolutions, setCurrentSolutions] = useState<string[]>([]);
  // Stable identity for the prop passed to ProjectForm. Without
  // useCallback, a fresh arrow function on every render combined with
  // form.watch() returning a new array reference each render produced
  // a React #185 "Maximum update depth exceeded" crash on /create
  // (production error err_1781199450117_hoph2y487). The form-side
  // useEffect now also guards by VALUE via a lastReportedRef, but we
  // pair that with a stable callback here so the deps array doesn't
  // churn at all.
  const handleSolutionChange = useCallback((solutions: string[]) => {
    setCurrentSolutions(solutions);
  }, []);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isCreateCustomerDialogOpen, setIsCreateCustomerDialogOpen] =
    useState(false);
  const [createAsTemplate, setCreateAsTemplate] = useState(false);
  const formRef = useRef<any>(null);

  // Every project's plan is a MAP: from the MAP template picked here, else a
  // Quick plan started later from the MAP drawer.
  const [selectedMapTemplate, setSelectedMapTemplate] = useState<{
    id: number;
    name: string;
    description?: string;
    phaseCount?: number;
    stepCount?: number;
    taskCount?: number;
  } | null>(null);
  const [isMapTemplateSelectorOpen, setIsMapTemplateSelectorOpen] =
    useState(false);
  const [selectedValidationTemplate, setSelectedValidationTemplate] = useState<number | null>(null);
  const [isValidationTemplateConfirmOpen, setIsValidationTemplateConfirmOpen] = useState(false);
  const [pendingValidationTemplate, setPendingValidationTemplate] = useState<number | null>(null);

  // Customer form schema and setup
  const customerFormSchema = z.object({
    accountName: z.string().min(1, "Account name is required"),
    industryId: z.string().min(1, "Industry is required"),
    productInterests: z
      .array(z.string())
      .min(1, "At least one product interest is required"),
    contactUsers: z
      .array(
        z.object({
          userId: z.string(),
          stakeholderTypes: z
            .array(
              z.enum([
                "Technical Champion",
                "Business Champion",
                "Economic Buyer",
                "Project Admin",
                "IT Admin",
                "IT Leader",
                "Non-IT",
                "C-Level",
                "Leadership",
                "All",
                "None",
              ]),
            )
            .min(1, "At least one stakeholder type is required"),
        }),
      )
      .min(1, "At least one contact user is required"),
  });

  type CustomerFormData = z.infer<typeof customerFormSchema>;

  const customerForm = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      accountName: "",
      industryId: "",
      productInterests: [],
      contactUsers: [],
    },
  });

  // Fetch required data for customer form
  const { data: industries = [] } = useQuery({
    queryKey: ["/api/industries"],
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["/api/templates"],
  });

  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<any[]>({
    queryKey: ["/api/products"],
    enabled: true,
  });

  const { data: validationTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/validation-criteria-templates"],
    enabled: true,
  });

  // Filter to show only Active validation templates in dropdown
  const activeValidationTemplates = useMemo(() => {
    return validationTemplates.filter((template: any) => template.isActive !== false);
  }, [validationTemplates]);

  const { data: validationTemplateDetails } = useQuery({
    queryKey: [`/api/validation-criteria-templates/${selectedValidationTemplate}`],
    enabled: !!selectedValidationTemplate,
  });

  const selectedValidationTemplateName = useMemo(() => {
    if (!selectedValidationTemplate) return null;
    const t = activeValidationTemplates.find((t: any) => t.id === selectedValidationTemplate);
    return t?.name ?? null;
  }, [selectedValidationTemplate, activeValidationTemplates]);

  // Helper function to convert solution name/slug to product ID
  const solutionNameToProductId = useMemo(() => {
    return (solutionName: string | null | undefined): number | null => {
      if (!solutionName || !products.length) return null;

      const normalized = (solutionName || '').trim();
      if (!normalized) return null;

      // Try exact name match first (case-insensitive)
      const exactMatch = products.find(
        (p: any) => p.name?.toLowerCase() === normalized.toLowerCase()
      );
      if (exactMatch) return exactMatch.id;

      // Try slug match (lowercase, replace spaces with hyphens)
      const slug = normalized.toLowerCase().replace(/\s+/g, '-');
      const slugMatch = products.find((p: any) => {
        const productSlug = (p.name || '').toLowerCase().replace(/\s+/g, '-');
        return productSlug === slug;
      });
      if (slugMatch) return slugMatch.id;

      // No match found
      return null;
    };
  }, [products]);

  // Convert array of solution names to Set of product IDs
  const solutionsToProductIds = useMemo(() => {
    return (solutions: string[] | null | undefined): Set<number> => {
      if (!solutions || !Array.isArray(solutions)) return new Set();

      const ids = solutions
        .map(solutionNameToProductId)
        .filter((id): id is number => id !== null);

      return new Set(ids);
    };
  }, [solutionNameToProductId]);

  // Listen for template success criteria loaded from dropdown selection
  useEffect(() => {
    const handleTemplateSuccessCriteriaLoaded = (event: CustomEvent) => {
      console.log(
        "Template success criteria loaded from dropdown:",
        event.detail,
      );
      setSuccessCriteria(event.detail);
    };

    window.addEventListener(
      "templateSuccessCriteriaLoaded",
      handleTemplateSuccessCriteriaLoaded as EventListener,
    );

    return () => {
      window.removeEventListener(
        "templateSuccessCriteriaLoaded",
        handleTemplateSuccessCriteriaLoaded as EventListener,
      );
    };
  }, []);

  // Inject validation template details into success criteria when loaded
  useEffect(() => {
    if (!validationTemplateDetails) return;

    const buildSuccessCriteriaFromTemplate = async () => {
      const criteriaArray: DraftSuccessCriteria[] = [];
      const links = (validationTemplateDetails as any).links || [];
      let skippedCount = 0;

      console.log('[buildSuccessCriteriaFromTemplate] Received links from API:', links.length, 'links');
      console.log('[buildSuccessCriteriaFromTemplate] Sample links:', JSON.stringify(links.slice(0, 3), null, 2));

      // Build hierarchy: solution → criteria → outcome → action
      for (const link of links) {
        try {
          // Validate required IDs
          if (!link.productId || !link.criteriaId) {
            console.warn("Skipping template link with missing required IDs:", link);
            skippedCount++;
            continue;
          }

          // Fetch the solution (product) name
          const solution = await apiRequest('GET', `/api/products/${link.productId}`);

          // Fetch the criteria name
          const criteria = await apiRequest('GET', `/api/criteria/${link.criteriaId}`);

          // Fetch the outcome name (only if expectedOutcomeId exists)
          let outcome = null;
          if (link.expectedOutcomeId) {
            try {
              outcome = await apiRequest('GET', `/api/outcomes/${link.expectedOutcomeId}`);
            } catch (error) {
              console.warn(`Failed to fetch outcome ${link.expectedOutcomeId}, leaving empty`);
            }
          }

          // Fetch the action name (only if actionItemId exists)
          let action = null;
          if (link.actionItemId) {
            try {
              action = await apiRequest('GET', `/api/actions/${link.actionItemId}`);
            } catch (error) {
              console.warn(`Failed to fetch action ${link.actionItemId}, leaving empty`);
            }
          }

          // Fetch component if componentId exists
          let component = null;
          if (link.componentId) {
            try {
              component = await apiRequest('GET', `/api/components/${link.componentId}`);
            } catch (error) {
              console.warn(`Failed to fetch component ${link.componentId}, leaving empty`);
            }
          }

          // Auto-detect N/A entities and enable "Show Hidden" checkboxes
          // Helper to check if entity is N/A for this solution
          const isEntityNA = (entity: any, solutionId: number) => {
            if (!entity) return false;

            // Check if entity is marked as "All Solutions"
            if (entity.isAllSolutions === true) {
              return false; // "All Solutions" entities apply everywhere, not N/A
            }

            // For components, check productId mismatch
            if (entity.productId !== undefined) {
              return entity.productId !== solutionId;
            }

            // For criteria/outcomes/actions, check solutionIds
            if (entity.solutionIds && Array.isArray(entity.solutionIds)) {
              return !entity.solutionIds.includes(solutionId);
            }

            // If no solutionIds array, it's an N/A entity
            return true;
          };

          const showHiddenFields = {
            component: component ? isEntityNA(component, link.productId) : false,
            criteria: criteria ? isEntityNA(criteria, link.productId) : false,
            expectedOutcome: outcome ? isEntityNA(outcome, link.productId) : false,
            actionItem: action ? isEntityNA(action, link.productId) : false,
          };

          // Build success criteria object (using extended format that form expects)
          criteriaArray.push({
            productName: solution.name,
            componentId: link.componentId || null,
            componentName: component?.name || "",
            criterion: criteria.name,
            expectedOutcome: outcome?.name || "",
            actionItem: action?.name || "",
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
            showHiddenFields, // Auto-enable Show Hidden for N/A entities
          });
        } catch (error) {
          // Per-row error handling - log and skip this row
          console.error("Error processing template link, skipping:", link, error);
          skippedCount++;
        }
      }

      // Set the success criteria
      setSuccessCriteria(criteriaArray);

      // Show toast with results
      if (skippedCount > 0) {
        showWarningToast("Template Applied with Warnings", `Loaded ${criteriaArray.length} validation criteria. ${skippedCount} rows skipped due to missing data.`);
      } else {
        showSuccessToast("Template Applied", `Loaded ${criteriaArray.length} validation criteria from template.`);
      }
    };

    buildSuccessCriteriaFromTemplate();
  }, [validationTemplateDetails, toast]);

  // Load template data from sessionStorage if available
  useEffect(() => {
    // Check if this is a duplicate operation first
    const urlParams = new URLSearchParams(window.location.search);
    const isDuplicate = urlParams.get("duplicate") === "true";

    if (isDuplicate) {
      const duplicateData = localStorage.getItem("duplicateProjectData");
      if (duplicateData) {
        try {
          const projectData = JSON.parse(duplicateData);
          setTemplateData(projectData);

          // Set solutions from duplicated project
          if (projectData.solutionName) {
            const projectSolutions = Array.isArray(projectData.solutionName)
              ? projectData.solutionName
              : [projectData.solutionName];
            setCurrentSolutions(projectSolutions);
          }

          // Clear the duplicate data from localStorage after loading
          localStorage.removeItem("duplicateProjectData");

          // Remove the duplicate parameter from URL
          window.history.replaceState({}, "", "/create");
        } catch (error) {
          console.error("Error parsing duplicate project data:", error);
        }
        return; // Exit early if duplicate data was found
      }
    }

    // Load template data if not duplicating (from templates section)
    const savedTemplate = sessionStorage.getItem("templateData");
    if (savedTemplate) {
      try {
        const template = JSON.parse(savedTemplate);
        setTemplateData(template);
        console.log("Loaded template data:", template);

        // Set solutions from template
        if (template.solutionName) {
          const templateSolutions = Array.isArray(template.solutionName)
            ? template.solutionName
            : [template.solutionName];
          setCurrentSolutions(templateSolutions);
          console.log("Set solutions from template:", templateSolutions);
        }

        // Set success criteria from template
        if (
          template.successCriteria &&
          Array.isArray(template.successCriteria)
        ) {
          console.log(
            "Loading success criteria from template:",
            template.successCriteria,
          );
          setSuccessCriteria(template.successCriteria);
        }

        // Plan from the template: its MAP template, when it has one.
        if (template.mode === "use" && typeof template.mapTemplateId === "number") {
          setSelectedMapTemplate({
            id: template.mapTemplateId,
            name: typeof template.mapTemplateName === "string" ? template.mapTemplateName : "",
          });
        }

        // Clear the template data from sessionStorage after loading
        sessionStorage.removeItem("templateData");
      } catch (error) {
        console.error("Error parsing template data:", error);
      }
    }

    // Load legacy template data (for backwards compatibility)
    const legacySavedTemplate = sessionStorage.getItem("selectedTemplate");
    if (legacySavedTemplate) {
      try {
        const template = JSON.parse(legacySavedTemplate);
        setTemplateData(template);
        // Set success criteria from template
        if (
          template.successCriteria &&
          Array.isArray(template.successCriteria)
        ) {
          setSuccessCriteria(
            template.successCriteria.map((sc: any) => ({
              criterion: sc.criterion,
              expectedOutcome: sc.expectedOutcome,
              actionItem: sc.actionItem,
            })),
          );
        }
        // Set initial solutions from template if available
        if (template.solutionName) {
          const templateSolutions = Array.isArray(template.solutionName)
            ? template.solutionName
            : [template.solutionName];
          setCurrentSolutions(templateSolutions);
          console.log(
            "Set initial solutions from template:",
            templateSolutions,
          );
        }
        // Clear the template data from sessionStorage after loading
        sessionStorage.removeItem("selectedTemplate");
      } catch (error) {
        console.error("Error parsing template data:", error);
      }
    }
  }, []);

  const handleConfirmValidationTemplateApply = () => {
    if (pendingValidationTemplate) {
      setSelectedValidationTemplate(pendingValidationTemplate);
      setPendingValidationTemplate(null);
    }
    setIsValidationTemplateConfirmOpen(false);
  };

  const handleCancelValidationTemplateApply = () => {
    setPendingValidationTemplate(null);
    setIsValidationTemplateConfirmOpen(false);
  };

  const handleMapTemplateSelected = (template: {
    id: number;
    name: string;
    description?: string;
    phaseCount?: number;
    stepCount?: number;
    taskCount?: number;
  }) => {
    setSelectedMapTemplate(template);
    setIsMapTemplateSelectorOpen(false);
  };

  const handleRemoveMapTemplate = () => {
    setSelectedMapTemplate(null);
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToSignIn();
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  // Working days the new project runs: the template's value when it came
  // from one, else start to end date (weekends skipped).
  const projectDurationWorkingDays = (projectData: ProjectFormSubmitData): number | null => {
    const fromTemplate = templateData?.mode === "use" ? parseProjectWorkingDays(templateData.durationWorkingDays) : null;
    if (fromTemplate !== null) return fromTemplate;
    const { startDate, endDate } = projectData;
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return null;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
    return parseProjectWorkingDays(
      workingDaysBetween(toIsoDate(startDate), toIsoDate(endDate), { holidays: new Set<string>() }),
    );
  };

  const saveProjectAsTemplate = async (projectData: ProjectFormSubmitData) => {
    const sourceName = (projectData.projectName || projectData.customerName || "").trim();
    const payload = buildProjectTemplatePayload({
      submit: projectData,
      successCriteria,
      mapTemplate: selectedMapTemplate ? { id: selectedMapTemplate.id, name: selectedMapTemplate.name } : null,
      validationTemplate:
        selectedValidationTemplate && selectedValidationTemplateName
          ? { id: selectedValidationTemplate, name: selectedValidationTemplateName }
          : null,
      durationWorkingDays: projectDurationWorkingDays(projectData),
      name: sourceName
        ? t("templates.saveAsTemplate.defaultName", { name: sourceName })
        : t("templates.saveAsTemplate.untitledName"),
      description: sourceName
        ? t("templates.saveAsTemplate.defaultDescription", { name: sourceName })
        : t("templates.saveAsTemplate.untitledDescription"),
    });
    try {
      await apiRequest("POST", "/api/templates", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      showSuccessToast(
        t("templates.saveAsTemplate.savedTitle"),
        t("templates.saveAsTemplate.savedBody", { name: payload.name }),
      );
    } catch (templateError: unknown) {
      console.error("Save as project template error:", templateError);
      const message = templateError instanceof Error ? templateError.message : "";
      showWarningToast(
        t("templates.saveAsTemplate.saveFailedTitle"),
        t("templates.saveAsTemplate.saveFailedBody", { message }),
      );
    }
  };

  const createProjectMutation = useMutation({
    mutationFn: async (projectData: ProjectFormSubmitData) => {
      return await apiRequest("POST", "/api/projects", projectData);
    },
    onSuccess: async (project, projectData) => {
      // Create success criteria
      try {
        for (const criteria of successCriteria) {
          if (criteria.criterion || criteria.criteriaId) {
            await apiRequest("POST", "/api/success-criteria", {
              ...criteria,
              projectId: project.id,
            });
          }
        }
      } catch (criteriaError: any) {
        console.error("Success criteria creation error:", criteriaError);
        showWarningToast("Warning", `Project created but success criteria failed: ${criteriaError?.message || "Unknown error"}`);
      }

      // A MAP template was picked: build the plan from it BEFORE navigation.
      // Without one the project starts with no plan; its MAP drawer offers a
      // Quick plan or a template.
      if (selectedMapTemplate?.id) {
        try {
          await apiRequest(
            "POST",
            `/api/projects/${project.id}/map/from-template`,
            {
              templateId: selectedMapTemplate.id,
            },
          );

          // Invalidate MAP queries for the new project
          queryClient.invalidateQueries({
            queryKey: ["/api/projects", project.id, "map"],
          });

          showSuccessToast("Success", `Project created with MAP from ${selectedMapTemplate.name}!`);
        } catch (mapError: any) {
          console.error("MAP creation error:", mapError);
          showWarningToast("Warning", `Project created but MAP creation failed: ${mapError?.message || "Unknown error"}`);
        }
      } else {
        showSuccessToast("Success", "Project created successfully!");
      }

      // Sync project competitors ("Competing With"). The mutation accepts a
      // payload widened from `InsertPoc` to `ProjectFormSubmitData` (the form
      // emits an extra `projectCompetingWith` array alongside the persisted
      // columns); `mutate` is invoked with the same wider value below, so we
      // can read the field directly.
      const competingWith = projectData.projectCompetingWith;
      if (Array.isArray(competingWith) && competingWith.length > 0) {
        try {
          const syncRes = await fetch(`/api/project-competitors/sync/${project.id}`, {
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

      // Invalidate and refetch Projects
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });

      // "Save As Project Template": save the project's setup as a template in
      // the creator's My Templates (an admin can promote it to System later).
      if (createAsTemplate) {
        await saveProjectAsTemplate(projectData);
      }

      setLocation("/");
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        redirectToSignIn();
        return;
      }

      // Extract detailed error information
      let errorDescription = "Failed to create project. Please try again.";

      if (error?.message) {
        errorDescription = `Project creation failed: ${error.message}`;
      }

      // Log the full error for debugging
      console.error("Project creation error:", error);

      showErrorToast("Project Creation Error", errorDescription);
    },
  });

  // Customer creation mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: CustomerFormData) => {
      return await apiRequest("POST", "/api/customers", customerData);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Customer created successfully",
      });
      setIsCreateCustomerDialogOpen(false);
      customerForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        redirectToSignIn();
        return;
      }

      let errorDescription = "Failed to create customer. Please try again.";

      if (error?.message) {
        errorDescription = `Customer creation failed: ${error.message}`;
      }

      console.error("Customer creation error:", error);

      showErrorToast("Customer Creation Error", errorDescription);
    },
  });

  // User creation mutation

  // The form supplies a richer payload (Date objects, uploaded files,
  // map template id, project links, etc.). The mutation
  // accepts the canonical `InsertPoc` shape; the additional fields are
  // tolerated server-side and persisted alongside the core record.
  const handleSubmit = (projectData: ProjectFormSubmitData) => {
    const dataWithTemplate: ProjectFormSubmitData & {
      validationCriteriaTemplateId?: number;
      templateId?: string;
    } = {
      ...projectData,
      validationCriteriaTemplateId: selectedValidationTemplate || undefined,
      // Records the source template and bumps its usage count.
      ...(templateData?.mode === "use" && typeof templateData.templateId === "string"
        ? { templateId: templateData.templateId }
        : {}),
    };
    createProjectMutation.mutate(dataWithTemplate);
  };

  // Customer form submit handler
  const handleCustomerFormSubmit = (customerData: CustomerFormData) => {
    createCustomerMutation.mutate(customerData);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen dark:text-gray-300">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header - "Floating Rail" with Global Gradient */}
      <Card className="relative overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800 rounded-xl p-2 group">
        {/* 1. GLOBAL BACKGROUND GRADIENT */}
        <div
          className="dark:hidden absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(59,130,246,0.15) 60%, rgba(59,130,246,0.25) 100%)",
          }}
        />
        <div
          className="hidden dark:block absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, rgba(31,41,55,1) 0%, rgba(30,58,138,0.4) 70%, rgba(30,58,138,0.6) 100%)",
          }}
        />

        {/* 2. FLEX CONTAINER (Z-Index ensures it sits ON TOP of gradient) */}
        <div className="flex items-stretch h-24 relative z-10">
          {/* LEFT SIDE: Content */}
          <div className="flex-1 flex flex-col justify-center px-4">
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <FilePlus data-title-icon className="h-6 w-6" />
                Create New Project
              </CardTitle>
              <CardDescription>
                Document and define the Project stakeholders, requirements, actions, and success criteria. Plan the work as a Mutual Action Plan (MAP), from a MAP template or as a Quick plan from the project's MAP drawer. Utilize templates to standardize project creation and ensure repeatability across similar projects.
              </CardDescription>
            </CardHeader>

            {/* Decorative Background Icon */}
            <FilePlus
              className="absolute right-24 top-1/2 h-32 w-32 text-blue-500/5 dark:text-white/5 pointer-events-none"
              style={{ transform: "translateY(-50%) rotate(-12deg)" }}
            />
          </div>

          {/* RIGHT SIDE: The "Floating Rail" */}
          <div className="w-20 bg-[#1e3a8a] dark:bg-blue-900 rounded-lg flex items-center justify-center shadow-md text-white shrink-0 relative overflow-hidden ml-2 group-hover:shadow-lg transition-all duration-300">
            {/* Glass Gloss Effect */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
            <Plus className="h-8 w-8 text-blue-100" />
          </div>
        </div>
      </Card>
      {/* END Of Header */}

      <Card className="dark:bg-slate-900">
        <CardContent className="p-4">
          <div className="space-y-8">
            {/* Main Project Form */}
            <ProjectForm
              ref={formRef}
              initialData={templateData}
              onSubmit={handleSubmit}
              isLoading={createProjectMutation.isPending}
              onSolutionChange={handleSolutionChange}
              templateData={templateData}
              selectedMapTemplate={selectedMapTemplate}
              handleRemoveMapTemplate={handleRemoveMapTemplate}
              setIsMapTemplateSelectorOpen={setIsMapTemplateSelectorOpen}
              validationCriteriaTemplateName={selectedValidationTemplateName}
              validationSectionContent={
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
                            <p>Validation Criteria Templates lets you model Project solution validation paths by linking Solutions, Criteria, Expected Outcomes, and Actions Taken.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={selectedValidationTemplate?.toString() || ""}
                      onValueChange={(value) => {
                        if (value) {
                          const templateId = parseInt(value);
                          if (successCriteria.length > 0) {
                            setPendingValidationTemplate(templateId);
                            setIsValidationTemplateConfirmOpen(true);
                          } else {
                            setSelectedValidationTemplate(templateId);
                          }
                        } else {
                          setSelectedValidationTemplate(null);
                        }
                      }}
                    >
                      <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {productsLoading ? (
                          <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                            Loading templates...
                          </div>
                        ) : (
                          (() => {
                            console.log("Template filtering - currentSolutions:", currentSolutions);
                            console.log("Template filtering - total templates:", (activeValidationTemplates as any[])?.length);

                            const filtered = (activeValidationTemplates as any[])
                              .filter((template: any) => {
                                if (!template.solutionName || !currentSolutions.length) {
                                  console.log(`Template "${template.name}" filtered out - empty data:`, {
                                    templateSolutions: template.solutionName,
                                    currentSolutions: currentSolutions
                                  });
                                  return false;
                                }

                                const templateSolutions = Array.isArray(template.solutionName)
                                  ? template.solutionName
                                  : [template.solutionName];

                                const templateProductIds = solutionsToProductIds(templateSolutions);
                                const currentProductIds = solutionsToProductIds(currentSolutions);

                                const hasUnmappedTemplateSolutions = templateProductIds.size < templateSolutions.length;
                                const hasUnmappedCurrentSolutions = currentProductIds.size < currentSolutions.length;

                                if (hasUnmappedTemplateSolutions || hasUnmappedCurrentSolutions) {
                                  console.warn(
                                    `Template filtering: ID mapping incomplete for template "${template.name}". ` +
                                    `Template solutions: ${templateSolutions.join(', ')} (${templateProductIds.size}/${templateSolutions.length} mapped). ` +
                                    `Current solutions: ${currentSolutions.join(', ')} (${currentProductIds.size}/${currentSolutions.length} mapped). ` +
                                    `Falling back to normalized name comparison.`
                                  );

                                  const normalizedTemplateSolutions = templateSolutions.map((s: string) => 
                                    s.toLowerCase().trim().replace(/\s+/g, '-')
                                  ).sort();

                                  const normalizedCurrentSolutions = currentSolutions.map((s: string) => 
                                    s.toLowerCase().trim().replace(/\s+/g, '-')
                                  ).sort();

                                  if (normalizedTemplateSolutions.length !== normalizedCurrentSolutions.length) return false;

                                  return normalizedTemplateSolutions.every((s: string, i: number) => s === normalizedCurrentSolutions[i]);
                                }

                                if (templateProductIds.size === 0 || currentProductIds.size === 0) {
                                  console.warn(
                                    `Template filtering: Empty product ID sets for template "${template.name}". ` +
                                    `Template solutions: ${templateSolutions.join(', ')}. ` +
                                    `Current solutions: ${currentSolutions.join(', ')}.`
                                  );
                                  return false;
                                }

                                if (templateProductIds.size !== currentProductIds.size) return false;

                                const matches = Array.from(templateProductIds).every(id => currentProductIds.has(id)) &&
                                       Array.from(currentProductIds).every(id => templateProductIds.has(id));

                                console.log(`Template "${template.name}" match result: ${matches}`, {
                                  templateProductIds: Array.from(templateProductIds),
                                  currentProductIds: Array.from(currentProductIds)
                                });

                                return matches;
                              });

                            console.log(`Template filtering complete - ${filtered.length} active templates match out of ${(activeValidationTemplates as any[])?.length} total active templates`);

                            return filtered.map((template: any) => (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                <div className="flex items-center gap-2">
                                  <DynamicIcon name={template.icon || "LayoutTemplate"} className="h-4 w-4" />
                                  <span>{template.name}</span>
                                </div>
                              </SelectItem>
                            ));
                          })()
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <SuccessCriteriaForm
                    criteria={successCriteria}
                    onChange={setSuccessCriteria}
                    selectedSolutions={currentSolutions}
                    showExistingCriteria={false}
                  />
                </div>
              }
              assumptionsSectionContent={
                <div className="rounded-lg border border-dashed border-[#226600]/40 bg-[#226600]/[0.04] p-6 text-center">
                  <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-[#226600]/60" />
                  <p className="text-sm font-medium text-[#226600] dark:text-[#86efac]">
                    Available after saving the project
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Assumptions and dependencies can be added once the project has been created.
                  </p>
                </div>
              }
            />

            {/* Save-as-template + Create Project actions sit below the last section */}
            <div className="flex items-center justify-end border-t dark:border-gray-700 pt-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="create-as-template"
                    checked={createAsTemplate}
                    onCheckedChange={(checked) =>
                      setCreateAsTemplate(checked === true)
                    }
                  />
                  <Label
                    htmlFor="create-as-template"
                    className="text-sm font-medium dark:text-gray-300"
                  >
                    {t("templates.saveAsTemplate.label")}
                  </Label>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    if (formRef.current) {
                      formRef.current.handleSubmit();
                    }
                  }}
                  disabled={createProjectMutation.isPending}
                  className="bg-primary hover:bg-primary/90"
                >
                  <FilePlus className="h-4 w-4 mr-2 text-white" />
                  {createProjectMutation.isPending
                    ? t("common.creating")
                    : t("header.createProject")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hidden triggers for header buttons */}
      <Button
        style={{ display: "none" }}
        data-create-user-project
        onClick={() => setIsCreateUserDialogOpen(true)}
      >
        Hidden Create User Trigger
      </Button>

      <Button
        style={{ display: "none" }}
        data-create-customer-project
        onClick={() => setIsCreateCustomerDialogOpen(true)}
      >
        Hidden Create Customer Trigger
      </Button>

      {/* Unified Create User Dialog */}
      <CreateUserDialog
        isOpen={isCreateUserDialogOpen}
        onClose={() => setIsCreateUserDialogOpen(false)}
      />

      {/* Unified Create Customer Dialog */}
      <CreateCustomerDialog
        isOpen={isCreateCustomerDialogOpen}
        onClose={() => setIsCreateCustomerDialogOpen(false)}
        onCustomerCreated={() => {
          setIsCreateCustomerDialogOpen(false);
          // Refresh customer data for the dropdown
          queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        }}
      />

      {/* MAP Template Selector */}
      <MapTemplateSelector
        open={isMapTemplateSelectorOpen}
        onOpenChange={setIsMapTemplateSelectorOpen}
        projectId={0} // Placeholder - will modify component to handle project creation mode
        onTemplateSelected={(template) => {
          // Store selected template data and close modal
          if (template) {
            handleMapTemplateSelected(template);
          }
          setIsMapTemplateSelectorOpen(false);
        }}
      />

      {/* Validation Template Confirmation Dialog */}
      <Dialog open={isValidationTemplateConfirmOpen} onOpenChange={setIsValidationTemplateConfirmOpen}>
        <DialogContent className="sm:max-w-md dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>Apply Validation Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Applying this template will overwrite all existing validation criteria in this section. Do you want to continue?
            </p>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={handleCancelValidationTemplateApply} className="dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmValidationTemplateApply}>
                Continue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}