import React, { useState, useEffect, useImperativeHandle, useMemo, useCallback, useRef } from "react";
import { useForm, type DefaultValues } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";
import { projectTeamSubmitValues } from "./ProjectTeamFields";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { validationRecordRequired } from "@shared/crm-provider";
import { useTranslation } from "react-i18next";
import { useDefaultWorkingCalendar } from "@/hooks/useDefaultWorkingCalendar";
import { addWorkingDays, toIsoDate, type WorkingCalendar } from "@shared/working-calendar";
import { parseProjectWorkingDays, projectWorkingDays } from "@shared/project-duration";
import { Button } from "@/components/ui/button";
import { 
  projectFormResolver,
  type FormData, 
  type ProjectFormContext,
  type ProjectFormProps,
  type ProjectFormHandle,
  type ProjectFormSubmitData,
  type ConfirmationDialogState,
  type ProjectLink 
} from "./types";
import type { FieldPath } from "react-hook-form";
import { 
  formatDateForInput, 
  calculateTotalDays, 
  countWorkingDays,
} from "./utils";
import { useProjectFormData } from "./useProjectFormData";
import { useTagManagement } from "./useTagManagement";
import { useTemplateHandling } from "./useTemplateHandling";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Hash, Plus, RefreshCw, Upload, File, CalendarIcon, Info, Calendar, Users, FolderOpen, Target, FolderSymlink, FileText, AlertCircle, Link, FileStack, Calendar1, BriefcaseBusiness, TriangleAlert, Handshake, Waypoints, UserLock, CircuitBoard, CircleCheckBig, FolderOpenDot, UserPen, BookMarked, Package, GitBranch, Video, Download, GraduationCap, Headphones, PlayCircle, Cloud, Globe, Lightbulb, ChevronDown, GlobeX, ShieldCheck, Building2 } from "lucide-react";
import { ProjectDocumentSelector } from "./project-document-selector";
import { ProjectLinkSelector } from "./project-link-selector";
import { LabelWithHelp, SectionHeaderWithHelp } from "@/components/shared/contextual-help";
import { MapTemplateSummary } from "./MapTemplateSummary";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CreateCustomerDialog from "@/components/accounts/CreateCustomerDialog";
import CreateUserDialog from "@/components/accounts/CreateUserDialog";
import { MapDrawer } from "@/components/project-form/MapDrawer";
import { GuidedFormSection } from "@/components/project-form/GuidedFormSection";
import { GuidedOverviewBanner } from "@/components/project-form/GuidedOverviewBanner";
import { SectionInfo } from "@/components/project-form/QuickJumpDropdown";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { EssentialsSection } from "./EssentialsSection";
import { TeamSection } from "./TeamSection";
import { AccessSection } from "./AccessSection";
import { RequirementsSection } from "./RequirementsSection";
import { ArtifactsSection } from "./ArtifactsSection";

const STAKEHOLDER_TYPE_OPTIONS = ["Technical Champion", "Business Champion", "Economic Buyer", "Project Admin", "IT Admin", "IT Leader", "Non-IT", "C-Level", "Leadership"];

export function ProjectForm({ ref, ...props }: ProjectFormProps & { ref?: React.Ref<ProjectFormHandle> }) {
  const { 
    initialData, 
    onSubmit, 
    isLoading, 
    isEdit = false, 
    onSolutionChange, 
    triggerSubmit = 0, 
    templateData, 
    existingSuccessCriteria = [], 
    onRemoveSolutionCriteria,
    selectedMapTemplate,
    handleRemoveMapTemplate,
    setIsMapTemplateSelectorOpen,
    projectId,
    validationSectionContent,
    isValidationSectionOpen,
    onValidationSectionToggle,
    assumptionsSectionContent,
    isAssumptionsSectionOpen,
    onAssumptionsSectionToggle,
    editModeControls,
    riskLevel,
    riskLevelConfigs = [],
    validationCriteriaTemplateName,
    accountLogoUrl,
  } = props;
  const { t } = useTranslation();
  // New projects end this many working days after they start: the template's
  // duration, else 14. Weekends and the organization's default holidays are skipped.
  const [plannedWorkingDays, setPlannedWorkingDaysState] = useState(() => projectWorkingDays(templateData));
  const setPlannedWorkingDays = useCallback(
    (days: number | null) => setPlannedWorkingDaysState(projectWorkingDays({ durationWorkingDays: days })),
    [],
  );
  useEffect(() => {
    if (templateData?.mode === 'use') setPlannedWorkingDays(parseProjectWorkingDays(templateData.durationWorkingDays));
  }, [templateData, setPlannedWorkingDays]);
  const defaultCalendar = useDefaultWorkingCalendar();
  const workingCalendar: WorkingCalendar = useMemo(() => defaultCalendar ?? { holidays: new Set<string>() }, [defaultCalendar]);
  // The form's `uploadedFiles` slot accepts either real `File` instances
  // (drag-and-drop selections that haven't been persisted yet) or the
  // hydrated document records returned by `/api/documents` (with
  // `filePath`/`documentId` etc.). Both shapes flow through the same array.
  type UploadedDocumentRecord = {
    name?: string;
    givenName?: string;
    originalName?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    description?: string;
    documentType?: string;
    filePath?: string;
    documentId?: number | string;
    uploadedAt?: string;
    uploadedBy?: string;
  };
  type UploadedFileEntry = File | UploadedDocumentRecord;
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileEntry[]>([]);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadFormData, setUploadFormData] = useState({
    givenName: "",
    description: "",
    documentType: "",
    solutionIds: [] as number[],
    file: null as File | null
  });

  const [projectLinks, setProjectLinks] = useState<{linkType: string, url: string, description: string, name?: string, linkId?: string}[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<any[]>([]);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    isOpen: boolean;
    solutionName: string;
    criteriaCount: number;
    onConfirm: () => void;
  }>({
    isOpen: false,
    solutionName: '',
    criteriaCount: 0,
    onConfirm: () => {}
  });

  // State for MAP drawer
  const [isMapDrawerOpen, setIsMapDrawerOpen] = useState(false);

  // State for Create Customer and Create User dialogs
  const [isCreateCustomerDialogOpen, setIsCreateCustomerDialogOpen] = useState(false);
  // Account Name in CRM mode: the CRM link to fill in the account dialog,
  // and the existing account being linked (null = a new account).
  const [crmPrefillUrl, setCrmPrefillUrl] = useState<string | undefined>(undefined);
  const [accountToLink, setAccountToLink] = useState<any>(null);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);

  // State for guided form sections - all collapsed by default, can be toggled independently
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    template: false,
    essentials: false,
    timeline: false,
    team: false,
    access: false,
    requirements: false,
    plan: false,
    artifacts: false,
    validation: false,
    assumptionsDeps: false,
  });

  // Track the currently active section for ProgressSteps indicator
  const [activeSectionId, setActiveSectionId] = useState<string | undefined>(undefined);

  // Track whether project name has been manually edited by user
  const [isProjectNameManuallyEdited, setIsProjectNameManuallyEdited] = useState(false);

  // Toggle section open/closed
  const toggleSection = useCallback((sectionId: string) => {
    setOpenSections(prev => {
      const newState = { ...prev, [sectionId]: !prev[sectionId] };
      // Update active section: if opening, this becomes active; if closing, find another open section
      if (newState[sectionId]) {
        setActiveSectionId(sectionId);
      } else {
        // Find first remaining open section
        const orderedSections = ['essentials', 'timeline', 'team', 'access', 'requirements', 'plan', 'artifacts', 'validation'];
        const firstOpen = orderedSections.find(s => newState[s]);
        setActiveSectionId(firstOpen || undefined);
      }
      return newState;
    });
  }, []);

  // Scroll to and open a specific section
  const jumpToSection = useCallback((sectionId: string) => {
    setOpenSections(prev => ({ ...prev, [sectionId]: true }));
    setActiveSectionId(sectionId);
    setTimeout(() => {
      const element = document.getElementById(`section-${sectionId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  const { toast } = useToast();

  const updateStakeholderTypesMutation = useMutation({
    mutationFn: async ({ userId, stakeholderTypes }: { userId: string; stakeholderTypes: string[] }) => {
      return apiRequest('PUT', `/api/users/${userId}`, { stakeholderTypes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: "Stakeholder types updated", variant: "default" });
    },
    onError: () => {
      showErrorToast("Failed to update stakeholder types");
    }
  });

  // Initialize form early so we can use it in hooks
  const getDefaultValues = () => {
    const dataSource = (templateData?.mode === 'use' && templateData) ? templateData : initialData;
    const isUseTemplateMode = templateData?.mode === 'use';

    return {
      customerName: dataSource?.customerName || "",
      solutionName: Array.isArray(dataSource?.solutionName) ? dataSource.solutionName : (dataSource?.solutionName ? [dataSource.solutionName] : []),
      industry: dataSource?.industry || "",
      environment: dataSource?.environment || "",
      type: dataSource?.type || "",
      salesforceEvaluationLink: dataSource?.salesforceEvaluationLink || "",
      crmProvider: dataSource?.crmProvider || "",
      crmOpportunityId: dataSource?.crmOpportunityId || "",
      crmAccountId: dataSource?.crmAccountId || "",
      // A template has no account, so it never carries a profile.
      infrastructureProfileId: isUseTemplateMode ? null : (dataSource?.infrastructureProfileId ?? null),
      opportunityAcvValue: dataSource?.opportunityAcvValue && dataSource.opportunityAcvValue !== "0.00" ? 
        (dataSource.opportunityAcvValue.startsWith('$') ? dataSource.opportunityAcvValue : '$' + dataSource.opportunityAcvValue) : 
        "",
      businessProblem: dataSource?.businessProblem || "",
      solutionDescription: dataSource?.solutionDescription || "",
      policyConsiderations: dataSource?.policyConsiderations || "",
      notes: dataSource?.notes || "",
      customerObjective: dataSource?.customerObjective || "",
      customerStakeholder: dataSource?.customerStakeholder || "",
      status: dataSource?.status || "planning",
      customerAccessLevel: dataSource?.customerAccessLevel || "read_only",
      tags: dataSource?.tags || [],
      primarySe: dataSource?.primarySe || "",
      teamId: dataSource?.teamId ? String(dataSource.teamId) : "",
      subteamId: dataSource?.subteamId ? String(dataSource.subteamId) : "",
      specialistSe: dataSource?.specialistSe || "",
      supportingSalesEngineers: dataSource?.supportingSalesEngineers || [],
      additionalSupportingTeam: dataSource?.additionalSupportingTeam || [],
      accountRepresentative: dataSource?.accountRepresentative || "",
      opportunityEngineer: dataSource?.opportunityEngineer || "",
      risk: dataSource?.risk || "None",
      ranking: dataSource?.ranking || "In Quarter",
      uploadedFiles: dataSource?.uploadedFiles || [],
      customerLogo: dataSource?.customerLogo || null,
      startDate: dataSource?.startDate ? (dataSource.startDate instanceof Date ? formatDateForInput(dataSource.startDate) : (typeof dataSource.startDate === 'string' ? dataSource.startDate.split('T')[0] : dataSource.startDate)) : "",
      endDate: dataSource?.endDate ? (dataSource.endDate instanceof Date ? formatDateForInput(dataSource.endDate) : (typeof dataSource.endDate === 'string' ? dataSource.endDate.split('T')[0] : dataSource.endDate)) : "",
      projectName: dataSource?.projectName || dataSource?.name || "",
      customerUsers: dataSource?.customerUsers || [],
      additionalAccess: dataSource?.additionalAccess || [],
      projectLinks: dataSource?.projectLinks || [],
      complianceRegulations: dataSource?.complianceRegulations || [],
      tccUseProjectUser: dataSource?.tccUseProjectUser || false,
      tccUserId: dataSource?.tccUserId || undefined,
      tccFirstName: dataSource?.tccFirstName || "",
      tccLastName: dataSource?.tccLastName || "",
      tccCommitteeApproval: dataSource?.tccCommitteeApproval || false,
    };
  };

  // The resolver is built once in `./types.ts` via the `projectFormResolver`
  // adapter, which isolates the single re-assertion needed to bridge
  // `zodResolver`'s 3-generic return type and react-hook-form's
  // `Resolver<FormData>` constraint. See the helper for the rationale.
  const { provider: crmProvider, ready: crmReady } = useCrmProvider();
  const linkRequired = validationRecordRequired(crmReady ? crmProvider : undefined);
  const form = useForm<FormData, ProjectFormContext>({
    resolver: projectFormResolver,
    context: { crmProvider: crmReady ? crmProvider : undefined },
    defaultValues: getDefaultValues() as DefaultValues<FormData>,
  });

  // Watch form values for section completion tracking
  const watchedValues = form.watch();

  // Section completion tracking - counts completed required fields per section
  const getSectionCompletion = useMemo(() => {
    const checkField = (value: any): boolean => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    };

    return {
      essentials: {
        completed: [
          checkField(watchedValues.customerName),
          checkField(watchedValues.type),
          checkField(watchedValues.environment),
          checkField(watchedValues.opportunityAcvValue),
          linkRequired && checkField(watchedValues.salesforceEvaluationLink),
          checkField(watchedValues.accountRepresentative),
          checkField(watchedValues.solutionName),
        ].filter(Boolean).length,
        total: linkRequired ? 7 : 6,
      },
      timeline: {
        completed: [
          checkField(watchedValues.startDate),
          checkField(watchedValues.endDate),
        ].filter(Boolean).length,
        total: 2,
      },
      team: {
        completed: [
          checkField(watchedValues.opportunityEngineer),
        ].filter(Boolean).length,
        total: 1,
      },
      access: {
        completed: 0, // No required fields in this section
        total: 0,
      },
      requirements: {
        completed: [
          checkField(watchedValues.businessProblem),
          checkField(watchedValues.customerObjective),
          checkField(watchedValues.solutionDescription),
        ].filter(Boolean).length,
        total: 3,
      },
      plan: {
        completed: 0, // Optional section
        total: 0,
      },
      artifacts: {
        completed: 0, // Optional section
        total: 0,
      },
      template: {
        completed: 0, // Optional section
        total: 0,
      },
      validation: {
        completed: 0, // Optional section
        total: 0,
      },
      assumptionsDeps: {
        completed: 0, // Optional section
        total: 0,
      },
    };
  }, [watchedValues, linkRequired]);

  // Build sections info for QuickJumpDropdown (template section excluded - it's not a numbered section)
  const sectionsInfo: SectionInfo[] = useMemo(() => {
    const sections: Array<{ id: string; stepNumber: number; title: string; color: string }> = [
      { id: 'essentials', stepNumber: 1, title: 'Project Essentials', color: 'blue' },
      { id: 'timeline', stepNumber: 2, title: 'Project Timeline', color: 'green' },
      { id: 'team', stepNumber: 3, title: 'Internal Team', color: 'purple' },
      { id: 'access', stepNumber: 4, title: 'Account Access', color: 'amber' },
      { id: 'requirements', stepNumber: 5, title: 'Stakeholder Requirements', color: 'red' },
      { id: 'plan', stepNumber: 6, title: t('mapPlan.form.title'), color: 'cyan' },
      { id: 'artifacts', stepNumber: 7, title: 'Project Artifacts', color: 'orange' },
      { id: 'validation', stepNumber: 8, title: 'Validation Criteria', color: 'brand' },
      { id: 'assumptionsDeps', stepNumber: 9, title: 'Assumptions & Dependencies', color: 'forest' },
    ];
    
    return sections.map(s => {
      const completion = getSectionCompletion[s.id as keyof typeof getSectionCompletion];
      // Only mark as complete if there are required fields AND all are filled
      // Sections with total=0 (optional) stay neutral (not complete, not incomplete)
      return {
        ...s,
        isComplete: completion.total > 0 && completion.completed >= completion.total,
      };
    });
  }, [getSectionCompletion, t]);

  // Auto-expand and scroll to first invalid section on form error
  const scrollToFirstError = useCallback(() => {
    const errors = form.formState.errors;
    const errorFields = Object.keys(errors);
    
    if (errorFields.length === 0) return;

    // Map fields to sections
    const fieldToSection: Record<string, string> = {
      customerName: 'essentials',
      type: 'essentials',
      environment: 'essentials',
      opportunityAcvValue: 'essentials',
      salesforceEvaluationLink: 'essentials',
      accountRepresentative: 'essentials',
      solutionName: 'essentials',
      industry: 'essentials',
      startDate: 'timeline',
      endDate: 'timeline',
      opportunityEngineer: 'team',
      primarySe: 'team',
      specialistSe: 'team',
      businessProblem: 'requirements',
      customerObjective: 'requirements',
      solutionDescription: 'requirements',
    };

    const firstErrorField = errorFields[0];
    const sectionId = fieldToSection[firstErrorField] || 'essentials';
    
    jumpToSection(sectionId);
  }, [form.formState.errors, jumpToSection]);

  // Get current industry and customer for data fetching
  const currentIndustryName = form.watch("industry");
  const selectedCustomerName = form.watch("customerName");

  // Get authentication status and current user info. useAuth already loads the
  // current user from /api/auth/user — reuse it. (Previously this queried a
  // non-existent /api/user/me, which the SPA served index.html for, tripping the
  // apiRequest non-JSON guard and logging a spurious error on /create.)
  const { isAuthenticated, user } = useAuth();

  // Use consolidated data fetching hook
  const formData = useProjectFormData({
    isAuthenticated,
    currentIndustryId: undefined, // Will be set below
    selectedCustomerId: undefined, // Will be set below
  });

  const {
    systemTags,
    industries,
    roles,
    complianceRegulations,
    products,
    salesEngineers,
    templates,
    customers,
    users,
    industryComplianceRegulations,
    customerUsersForTcc,
  } = formData;

  // Get IDs after data is loaded
  const currentIndustry = industries.find((ind: any) => ind.name === currentIndustryName);
  const currentIndustryId = currentIndustry?.id;
  const selectedCustomer = customers.find((c: any) => c.accountName === selectedCustomerName);
  const selectedCustomerId = selectedCustomer?.id;

  // Gate: no accounts exist — all steps grayed out until an account is created (create mode only)
  const hasNoAccounts = !isEdit && Array.isArray(customers) && customers.length === 0;

  // Gate: selected account has no eligible users — Step 4 grayed out until a user is created
  const selectedCustomerContactUserIds = (selectedCustomer?.contactUsers ?? []).map((c: any) => c.userId);
  const selectedAccountUsers = users.filter((u: any) =>
    (u.role === 'Customer' || u.role === 'Guest') &&
    selectedCustomerContactUserIds.includes(u.id)
  );
  const hasNoAccountUsers = !!selectedCustomerName && selectedAccountUsers.length === 0;

  // Gate: Step 8 (Validation Criteria) requires at least one solution to be selected
  const hasSolutionsSelected = Array.isArray(watchedValues.solutionName) && watchedValues.solutionName.length > 0;

  // Auto-generate project name based on customer abbreviation and solution abbreviations
  // Format: CustomerAbbrev-SolutionAbbrevs-ID# (e.g., RBS-NA-NDC-17)
  useEffect(() => {
    // Don't auto-generate if user has manually edited the name
    if (isProjectNameManuallyEdited) return;
    
    // Don't auto-generate in edit mode if there's already a name
    if (isEdit && initialData?.name) return;
    
    const customerName = watchedValues.customerName;
    const solutions = Array.isArray(watchedValues.solutionName) ? watchedValues.solutionName : [];
    
    // Find customer abbreviation
    const customer = customers?.find((c: any) => c.accountName === customerName);
    const customerAbbrev = customer?.abbreviation || '';
    
    // Get solution abbreviations
    const solutionAbbrevs = solutions
      .map((sol: string) => {
        const product = products?.find((p: any) => p.name === sol);
        return product?.abbreviation || '';
      })
      .filter((abbrev: string) => abbrev.length > 0)
      .join('-');
    
    // Build the project name (without ID for new projects - backend appends ID after creation)
    const parts = [customerAbbrev, solutionAbbrevs].filter(p => p.length > 0);
    const generatedName = parts.length > 0 
      ? (projectId ? `${parts.join('-')}-${projectId}` : parts.join('-'))
      : '';
    
    // Only update if we have a generated name and it's different from current
    const currentName = watchedValues.projectName || '';
    if (generatedName && generatedName !== currentName) {
      form.setValue('projectName', generatedName, { shouldValidate: false });
    }
  }, [watchedValues.customerName, watchedValues.solutionName, customers, products, projectId, isProjectNameManuallyEdited, isEdit, initialData?.name, form]);

  // Handler for manual project name changes
  // Attach / detach the account's Infrastructure Discovery profile. On create
  // it is a form value; on edit it saves at once, like the overview selects.
  const handleInfrastructureProfileChange = useCallback(
    async (profile: { id: number } | null) => {
      const next = profile?.id ?? null;
      const previous = form.getValues("infrastructureProfileId") ?? null;
      form.setValue("infrastructureProfileId", next, { shouldDirty: !isEdit });
      if (!isEdit || !projectId || next === previous) return;
      try {
        await apiRequest("PATCH", `/api/projects/${projectId}`, { infrastructureProfileId: next });
        void queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
        showSuccessToast(t(next ? "projects.form.infraProfile.attachedToast" : "projects.form.infraProfile.detachedToast"));
      } catch {
        form.setValue("infrastructureProfileId", previous);
        showErrorToast(t("projects.form.infraProfile.saveError"));
      }
    },
    [form, isEdit, projectId, t],
  );

  const handleProjectNameChange = useCallback((newName: string) => {
    setIsProjectNameManuallyEdited(true);
    form.setValue('projectName', newName, { shouldValidate: false });
  }, [form]);

  // Function to handle solution removal with confirmation
  const handleRemoveSolution = async (solutionToRemove: string, currentValue: string[], field: any) => {
    // Check if this solution has any associated success criteria
    const criteriaForSolution = existingSuccessCriteria.filter(
      criteria => criteria.productName === solutionToRemove
    );

    if (criteriaForSolution.length > 0) {
      // Show confirmation dialog
      setConfirmationDialog({
        isOpen: true,
        solutionName: solutionToRemove,
        criteriaCount: criteriaForSolution.length,
        onConfirm: async () => {
          // Remove the solution from the form
          const newValue = currentValue.filter((s: string) => s !== solutionToRemove);
          field.onChange(newValue);

          // Remove associated success criteria via callback if provided
          if (onRemoveSolutionCriteria) {
            try {
              await onRemoveSolutionCriteria(solutionToRemove);
            } catch (error) {
              console.error("Failed to remove success criteria:", error);
              showWarningToast("Warning", "Solution removed but some success criteria may still exist.");
            }
          }

          // Close dialog
          setConfirmationDialog(prev => ({ ...prev, isOpen: false }));

          showSuccessToast("Solution Removed", `${solutionToRemove} and ${criteriaForSolution.length} associated success criteria removed.`);
        }
      });
    } else {
      // No criteria, remove directly
      const newValue = currentValue.filter((s: string) => s !== solutionToRemove);
      field.onChange(newValue);
    }
  };

  // Determine if we're in edit-template mode
  const isEditTemplateMode = templateData?.mode === 'edit-template';
  const isUseTemplateMode = templateData?.mode === 'use';

  // Customer users state for multiple selections with permissions
  const [selectedCustomerUsers, setSelectedCustomerUsers] = useState<Array<{userId?: string, email: string, permission: string, firstName?: string, lastName?: string}>>([]);

  // Additional access state for role-based users
  const [selectedAdditionalAccess, setSelectedAdditionalAccess] = useState<Array<{userId: string, permission: string}>>([]);

  // Supporting Engineers state for multiple selections
  const [selectedSupportingEngineers, setSelectedSupportingEngineers] = useState<Array<{userId: string}>>([]);

  // Additional Supporting Team state for multiple selections
  const [selectedAdditionalSupportingTeam, setSelectedAdditionalSupportingTeam] = useState<Array<{userId: string}>>([]);

  // Project competitors "Competing With" state
  const [projectCompetingWith, setProjectCompetingWith] = useState<Array<{
    spaceId: number;
    competitorId: number;
    spaceName: string;
    spaceColor: string;
    competitorName: string;
    relationship: string;
  }>>([]);

  // Track if form is currently being submitted to prevent reset during save
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  // Filter solutions for dropdown - exclude inactive solutions unless they're already selected
  const filteredSolutions = useMemo(() => {
    if (!products || products.length === 0) return [];

    return products.filter((product: any) => {
      // Always show active solutions
      if (product.isActive === true) {
        return true;
      }

      // For inactive solutions, only show them if they're already selected
      const currentSolutions = form?.watch("solutionName") || [];
      return currentSolutions.includes(product.name);
    });
  }, [products, form]);

  // Expose form methods to parent component
  useImperativeHandle(ref, (): ProjectFormHandle => ({
    getValues: () => form.getValues(),
    handleSubmit: () => form.handleSubmit(handleSubmit)(),
    setValue: (name, value) => form.setValue(name as FieldPath<FormData>, value as never),
    trigger: (name) => form.trigger(name as FieldPath<FormData> | undefined),
    setIsFormSubmitting: (value: boolean) => {
      console.log("Setting isFormSubmitting via ref to:", value);
      setIsFormSubmitting(value);
    },
  }));

  // Watch for solution changes and notify parent component.
  //
  // React #185 "Maximum update depth exceeded" guard. Two compounding
  // sources of identity churn used to cause an infinite render loop
  // here when this form lived under a parent that passed an inline
  // `onSolutionChange={(s) => setX(s)}` callback (production error
  // err_1781199450117_hoph2y487 on /create):
  //
  //   1. `form.watch("solutionName")` returns a NEW ARRAY reference
  //      on every render, even when the values are unchanged.
  //   2. An inline arrow function in the parent is a new function
  //      identity on every parent render.
  //
  // Either alone forced the useEffect deps to "change" on every
  // render → callback fires → parent setState → re-render → new
  // refs → fires again → infinite loop.
  //
  // The lastReportedRef compares by VALUE (JSON-stringified) so the
  // effect only actually calls `onSolutionChange` when the contents
  // genuinely changed, regardless of how many times the deps' object
  // identities shift. (Companion fix: the parents wrap their
  // handlers in useCallback so the function identity is stable too —
  // see create-project.tsx and edit-project.tsx.)
  const watchedSolutions = form.watch("solutionName");
  const lastReportedSolutionsRef = useRef<string>("");
  useEffect(() => {
    if (!onSolutionChange || !Array.isArray(watchedSolutions)) return;
    const serialized = JSON.stringify(watchedSolutions);
    if (serialized === lastReportedSolutionsRef.current) return;
    lastReportedSolutionsRef.current = serialized;
    onSolutionChange(watchedSolutions);
  }, [watchedSolutions, onSolutionChange]);

  // Watch for date changes to calculate project duration
  const watchedStartDate = form.watch("startDate");
  const watchedEndDate = form.watch("endDate");

  // Handle triggerSubmit prop to submit the form externally
  useEffect(() => {
    console.log("Trigger submit changed:", triggerSubmit);
    if (triggerSubmit > 0) {
      console.log("Form triggered externally, submitting...");
      console.log("Form validation errors before submit:", form.formState.errors);
      console.log("Form values before submit:", form.getValues());
      console.log("opportunityAcvValue specifically:", form.getValues().opportunityAcvValue);
      console.log("Form isValid:", form.formState.isValid);

      // Check if form is valid before submitting
      if (!form.formState.isValid) {
        console.log("Form is not valid, triggering validation and then submitting");
        form.trigger().then((isValid) => {
          console.log("Form validation result:", isValid);
          if (isValid) {
            console.log("Form is now valid, submitting...");
            form.handleSubmit(handleSubmit)();
          } else {
            console.log("Form validation failed, errors:", form.formState.errors);
          }
        });
      } else {
        console.log("Form is valid, submitting immediately...");
        form.handleSubmit(handleSubmit)();
      }
    }
  }, [triggerSubmit, form]);

  // Reset form when templateData changes (for use template mode) or initialData changes (for edit mode)
  useEffect(() => {
    if (isUseTemplateMode && templateData) {
      console.log("Resetting form with template data:", templateData);
      const newValues = getDefaultValues();

      // Reset all form values with template data
      Object.entries(newValues).forEach(([key, value]) => {
        form.setValue(key as keyof FormData, value);
      });

      // Set project links and documents from template
      if (templateData.projectLinks) {
        setProjectLinks(templateData.projectLinks);
      }

      // Set project documents from template
      if (templateData.projectDocuments && Array.isArray(templateData.projectDocuments)) {
        console.log("Setting project documents from template:", templateData.projectDocuments);
        setSelectedDocuments(templateData.projectDocuments);
        const templateDocuments = templateData.projectDocuments.map((doc: any) => ({
          name: doc.givenName || doc.fileName || `Document ${doc.id}`,
          size: doc.fileSize || 0,
          type: doc.fileType || 'application/octet-stream',
          lastModified: new Date(doc.createdAt || Date.now()).getTime(),
          isExistingDocument: true,
          documentId: doc.id,
          documentData: doc,
        }));
        console.log("Mapped template documents:", templateDocuments);
        setUploadedFiles(templateDocuments);
        form.setValue("uploadedFiles", templateDocuments, { shouldDirty: true });
      }

      // Typical competitors on the template become the project's "Competing With".
      if (Array.isArray(templateData.typicalCompetitors)) {
        setProjectCompetingWith(templateData.typicalCompetitors);
      }

      return;
    }

    if (initialData && isEdit) {
      console.log("Resetting form with initialData:", initialData);
      console.log("Is form submitting?", isFormSubmitting);

      // Prevent reset during form submission in edit mode
      if (isFormSubmitting) {
        console.log("Skipping form reset - currently submitting in edit mode");
        return;
      }

      // Also prevent reset if form has been modified by user
      if (form.formState.isDirty) {
        console.log("Skipping form reset - form has been modified by user");
        return;
      }

      // Handle case where initialData might be an array
      const data = Array.isArray(initialData) ? initialData[0] : initialData;
      console.log("Actual data object:", data);

      if (!data) {
        console.log("No data found to reset form");
        return;
      }

      // Store current values before reset to preserve user changes
      const currentOpportunityValue = form.getValues().opportunityAcvValue;
      const currentStartDate = form.getValues().startDate;
      const currentEndDate = form.getValues().endDate;
      console.log("Current values before reset:", {
        opportunityAcvValue: currentOpportunityValue,
        startDate: currentStartDate, 
        endDate: currentEndDate
      });
      console.log("Data values from server:", {
        opportunityAcvValue: data.opportunityAcvValue,
        startDate: data.startDate,
        endDate: data.endDate
      });

      // Convert server dates to proper format for comparison
      const serverStartDate = data.startDate ? (data.startDate instanceof Date ? data.startDate.toISOString().split('T')[0] : (typeof data.startDate === 'string' ? data.startDate.split('T')[0] : data.startDate)) : "";
      const serverEndDate = data.endDate ? (data.endDate instanceof Date ? data.endDate.toISOString().split('T')[0] : (typeof data.endDate === 'string' ? data.endDate.split('T')[0] : data.endDate)) : "";

      // Check if user has made changes by comparing with server data
      const hasUserChangedOpportunityValue = currentOpportunityValue !== (data.opportunityAcvValue || "");
      const hasUserChangedStartDate = currentStartDate !== serverStartDate;
      const hasUserChangedEndDate = currentEndDate !== serverEndDate;
      console.log("Date comparison details:", {
        currentStartDate,
        serverStartDate,
        currentEndDate,
        serverEndDate,
        startDateEqual: currentStartDate === serverStartDate,
        endDateEqual: currentEndDate === serverEndDate
      });
      console.log("Has user changed values?", {
        opportunity: hasUserChangedOpportunityValue,
        startDate: hasUserChangedStartDate,
        endDate: hasUserChangedEndDate
      });

      // Parse solutionName - handle complex nested JSON strings
      let parsedSolutionName = data.solutionName;
      if (typeof data.solutionName === 'string') {
        // Handle nested JSON strings like "{\"{\\\\\\\"Acme Data Classification\\\\\\\",...
        if (data.solutionName.startsWith('{')) {
          try {
            // First parse
            let parsed = JSON.parse(data.solutionName);
            // If it's still a string, parse again
            while (typeof parsed === 'string' && parsed.startsWith('{')) {
              parsed = JSON.parse(parsed);
            }
            parsedSolutionName = parsed;
          } catch (e) {
            console.warn('Failed to parse solutionName JSON:', e);
            // Extract readable values using regex if JSON parsing fails
            const matches = data.solutionName.match(/([A-Za-z\s]+(?:Classification|Auditor|Manager|Protection|Analytics))/g);
            parsedSolutionName = matches || [data.solutionName];
          }
        } else {
          // Handle comma-separated strings
          parsedSolutionName = data.solutionName.split(',').map((s: string) => s.trim());
        }
      }

      const resetData = {
        customerName: data.customerName || "",
        solutionName: Array.isArray(parsedSolutionName) ? parsedSolutionName : (parsedSolutionName ? [parsedSolutionName] : []),
        industry: data.industry || (data.customer?.industry) || "",
        environment: data.environment || "",
        type: data.type || "",
        opportunityName: data.opportunityName || "",
        salesforceEvaluationLink: data.salesforceEvaluationLink || "",
        crmProvider: data.crmProvider || "",
        crmOpportunityId: data.crmOpportunityId || "",
        crmAccountId: data.crmAccountId || "",
        infrastructureProfileId: data.infrastructureProfileId ?? null,
        opportunityAcvValue: hasUserChangedOpportunityValue ? currentOpportunityValue : (data.opportunityAcvValue || ""),
        businessProblem: data.businessProblem || "",
        solutionDescription: data.solutionDescription || "",
        policyConsiderations: data.policyConsiderations || "",
        notes: data.notes || "",
        customerObjective: data.customerObjective || "",
        customerStakeholder: data.customerStakeholder || "",
        status: data.status || "planning",
        customerAccessLevel: data.customerAccessLevel || "read_only",
        tags: data.tags || [],
        primarySe: data.primarySeId ? String(data.primarySeId) : (data.primarySe?.id ? String(data.primarySe.id) : (data.primarySe ? String(data.primarySe) : "")),
        teamId: data.teamId ? String(data.teamId) : "",
        subteamId: data.subteamId ? String(data.subteamId) : "",
        specialistSe: data.specialistSeId ? String(data.specialistSeId) : (data.specialistSe?.id ? String(data.specialistSe.id) : (data.specialistSe ? String(data.specialistSe) : "")),
        supportingSalesEngineers: data.supportingSes ? data.supportingSes.map((se: any) => String(se.id || se)) : [],
        accountRepresentative: data.accountRepresentativeId ? String(data.accountRepresentativeId) : (data.accountRepresentative?.id ? String(data.accountRepresentative.id) : (data.accountRepresentative ? String(data.accountRepresentative) : "")),
        opportunityEngineer: data.opportunityEngineerId ? String(data.opportunityEngineerId) : (data.opportunityEngineer?.id ? String(data.opportunityEngineer.id) : (data.opportunityEngineer ? String(data.opportunityEngineer) : "")),
        risk: data.risk || "None",
        ranking: data.ranking || "In Quarter",
        startDate: hasUserChangedStartDate ? currentStartDate : serverStartDate,
        endDate: hasUserChangedEndDate ? currentEndDate : serverEndDate,
        uploadedFiles: data.uploadedFiles || data.customerArtifacts || [],
        customerLogo: data.customerLogo || null,
        customerUsers: data.customerUsers || [],
        additionalAccess: data.additionalAccess || [],
        complianceRegulations: data.complianceRegulations || [],
        projectName: data.projectName || data.name || "",
        projectLinks: data.projectLinks || [],
        additionalSupportingTeam: data.additionalSupportingTeam || [],
        tccUseProjectUser: data.tccUseProjectUser || false,
        tccUserId: data.tccUserId || undefined,
        tccFirstName: data.tccFirstName || "",
        tccLastName: data.tccLastName || "",
        tccCommitteeApproval: data.tccCommitteeApproval || false,
      };
      // Auto-populate industry and customer logo from customer data if not already set or empty
      if (data.customerName && customers && industries) {
        const customer = customers.find((c: any) => c.accountName === data.customerName || c.customerName === data.customerName);
        console.log("Customer lookup:", { customerName: data.customerName, foundCustomer: customer, customers });
        if (customer) {
          // Auto-populate industry
          if (customer.industryId && (!resetData.industry || resetData.industry === "")) {
            const industry = industries.find((ind: any) => ind.id === customer.industryId);
            if (industry) {
              console.log("Setting industry from customer:", industry.name);
              resetData.industry = industry.name;
            }
          }
          // Auto-populate customer logo if not already set in project data
          if (customer.logoUrl && !data.customerLogo) {
            console.log("Setting customer logo from customer data:", customer.logoUrl);
            resetData.customerLogo = customer.logoUrl;
          }
        }
      }

      // Set uploaded files state from initialData or customerArtifacts
      const filesData = data.uploadedFiles || data.customerArtifacts || [];
      if (Array.isArray(filesData) && filesData.length > 0) {
        console.log("Setting uploaded files from initialData:", filesData);
        setUploadedFiles(filesData);
      } else {
        console.log("No uploaded files in initialData or not an array:", filesData);
        setUploadedFiles([]);
      }

      console.log("Reset data with dates:", {
        ...resetData,
        startDate: resetData.startDate,
        endDate: resetData.endDate
      });
      console.log("Form values before reset:", {
        startDate: form.getValues("startDate"),
        endDate: form.getValues("endDate")
      });
      form.reset(resetData);
      console.log("Form values after reset:", {
        startDate: form.getValues("startDate"),
        endDate: form.getValues("endDate")
      });

      // After reset, ensure uploaded files are set properly in the form
      setTimeout(() => {
        const filesToSet = data.uploadedFiles || data.customerArtifacts || [];
        console.log("Setting uploadedFiles after reset:", filesToSet);
        form.setValue("uploadedFiles", filesToSet, { shouldDirty: true });
        setUploadedFiles(filesToSet); // Also update component state
        console.log("Form uploadedFiles after reset:", form.getValues("uploadedFiles"));
      }, 0);

      // After reset, if user has changed values, override the reset values
      if (hasUserChangedOpportunityValue) {
        console.log("Overriding opportunity value after reset with user value:", currentOpportunityValue);
        form.setValue("opportunityAcvValue", currentOpportunityValue, { shouldDirty: true });
      }
      if (hasUserChangedStartDate) {
        console.log("Overriding start date after reset with user value:", currentStartDate);
        form.setValue("startDate", currentStartDate, { shouldDirty: true });
      }
      if (hasUserChangedEndDate) {
        console.log("Overriding end date after reset with user value:", currentEndDate);
        form.setValue("endDate", currentEndDate, { shouldDirty: true });
      }

      // Set customer users and additional access state from data
      // Prefer customerUsers (JSONB with userId) over customerAccess (table with only email)
      if (data.customerUsers && Array.isArray(data.customerUsers) && data.customerUsers.length > 0) {
        // Ensure userId is properly set in the state - lookup by email if userId is missing
        const enrichedCustomerUsers = data.customerUsers.map((user: any) => {
          let userId = user.userId ? String(user.userId) : undefined;
          let firstName = user.firstName;
          let lastName = user.lastName;
          
          // If userId is missing, try to look it up by email
          if (!userId && user.email && users) {
            const matchedUser = users.find(u => u.email === user.email);
            if (matchedUser) {
              userId = matchedUser.id;
              firstName = firstName || matchedUser.firstName;
              lastName = lastName || matchedUser.lastName;
            }
          }
          
          return {
            userId,
            email: user.email,
            permission: user.permission || 'View',
            firstName,
            lastName
          };
        });
        setSelectedCustomerUsers(enrichedCustomerUsers);
      }
      // Handle additional access - backend now returns enriched user objects
      if (data.additionalAccess && Array.isArray(data.additionalAccess)) {
        // Transform enriched user objects back to simple {userId, permission} format
        const accessData = data.additionalAccess.map((item: any) => {
          // Check if it's an enriched user object (has id property) or already in the right format
          if (typeof item === 'object' && item.id) {
            // Enriched user object from backend - extract userId
            return {
              userId: String(item.id),
              permission: item.permission || 'View' // Default to View if permission not present
            };
          } else if (typeof item === 'object' && item.userId) {
            // Already in correct format {userId, permission}
            return {
              userId: String(item.userId),
              permission: item.permission || 'View'
            };
          }
          // Fallback - shouldn't happen but handle gracefully
          return null;
        }).filter(Boolean); // Remove any null values

        setSelectedAdditionalAccess(accessData);
      }
      // Set supporting engineers state from data
      if (data.supportingSalesEngineers && Array.isArray(data.supportingSalesEngineers)) {
        setSelectedSupportingEngineers(data.supportingSalesEngineers.map((item: any) => ({ 
          userId: String(typeof item === 'object' && item.id ? item.id : item) 
        })));
      }
      // Set additional supporting team state from data
      if (data.additionalSupportingTeam && Array.isArray(data.additionalSupportingTeam)) {
        setSelectedAdditionalSupportingTeam(data.additionalSupportingTeam.map((item: any) => ({ 
          userId: String(typeof item === 'object' && item.id ? item.id : item) 
        })));
      }

      // Initialize project links for editing
      if (data.projectLinks && Array.isArray(data.projectLinks)) {
        setProjectLinks(data.projectLinks);
      }

      // Initialize customer access if available (only if customerUsers wasn't already loaded)
      // customerAccess table has userEmail but not userId, so we try to look up the user
      if ((!data.customerUsers || data.customerUsers.length === 0) && data.customerAccess && Array.isArray(data.customerAccess)) {
        const customerUsersFromAccess = data.customerAccess.map((access: any) => {
          // Try to look up the user by email to get userId, firstName, lastName
          const matchedUser = users?.find(u => u.email === access.userEmail);
          
          return {
            userId: matchedUser?.id || (access.userId ? String(access.userId) : undefined),
            email: access.userEmail,
            permission: access.permission,
            firstName: matchedUser?.firstName || access.firstName,
            lastName: matchedUser?.lastName || access.lastName
          };
        });
        setSelectedCustomerUsers(customerUsersFromAccess);
      }

      // Force form to re-render
      setTimeout(() => {
        console.log("Form values after reset:", form.getValues());
      }, 100);
    }
  }, [initialData?.id, isEdit, isFormSubmitting, users]); // Also re-run when users are loaded to enrich customerUsers data

  // Load project competitors independently — isolated from the main initialization
  // effect so that users-query invalidation after a save doesn't re-trigger this fetch.
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/project-competitors/${projectId}`, { credentials: 'include' })
      .then(r => r.json())
      .then((rows: any[]) => {
        if (Array.isArray(rows)) {
          setProjectCompetingWith(rows.map((r: any) => ({
            spaceId: r.spaceId,
            competitorId: r.competitorId,
            spaceName: r.spaceName || "",
            spaceColor: r.spaceColor || "#64748b",
            competitorName: r.competitorName || "",
            relationship: r.relationshipType || "",
          })));
        }
      })
      .catch(() => {});
  }, [projectId]);

  // Sync uploadedFiles state with form whenever it changes
  useEffect(() => {
    console.log("Syncing uploadedFiles state with form:", uploadedFiles);
    form.setValue("uploadedFiles", uploadedFiles, { shouldDirty: true });
  }, [uploadedFiles, form]);

  // Enrich selectedCustomerUsers with userId and names when users become available
  useEffect(() => {
    if (!users || users.length === 0 || selectedCustomerUsers.length === 0) return;
    
    // Check if any entries need enrichment (missing userId or name)
    const needsEnrichment = selectedCustomerUsers.some(
      cu => !cu.userId || (!cu.firstName && !cu.lastName)
    );
    
    if (!needsEnrichment) return;
    
    type SelectedCustomerUser = (typeof selectedCustomerUsers)[number];
    const enrichedUsers: SelectedCustomerUser[] = selectedCustomerUsers.map(cu => {
      // Skip if already has userId
      if (cu.userId && cu.firstName) return cu;

      // Look up by email
      const matchedUser = users.find(u => u.email === cu.email);
      if (!matchedUser) return cu;

      return {
        ...cu,
        userId: cu.userId || matchedUser.id,
        firstName: cu.firstName || matchedUser.firstName || undefined,
        lastName: cu.lastName || matchedUser.lastName || undefined,
      };
    });

    // Only update if something changed
    const hasChanges = enrichedUsers.some((eu, i) =>
      eu.userId !== selectedCustomerUsers[i].userId ||
      eu.firstName !== selectedCustomerUsers[i].firstName ||
      eu.lastName !== selectedCustomerUsers[i].lastName
    );

    if (hasChanges) {
      setSelectedCustomerUsers(enrichedUsers);
    }
  }, [users, selectedCustomerUsers]);

  // Use system tags which contains both system and user-created tags
  const allTags = systemTags || [];

  // Use tag management hook
  const {
    tagInput,
    setTagInput,
    suggestedTags,
    suggestedTagsIndex,
    setSuggestedTagsIndex,
    handleAddTag,
    handleRemoveTag,
    updateSuggestedTags,
  } = useTagManagement({
    form,
    allTags,
    toast,
  });

  const handleSubmit = (data: FormData) => {
    // Prevent duplicate submissions
    if (isFormSubmitting) {
      console.log("Form is already being submitted, ignoring duplicate submission");
      return;
    }

    console.log("=== FORM VALIDATION PASSED ===");
    console.log("Raw form data received:", data);

    // Set submission flag to prevent duplicates
    setIsFormSubmitting(true);

    // Ensure customerUsers have userId resolved before submitting
    const enrichedCustomerUsers = selectedCustomerUsers.map(cu => {
      if (cu.userId) return cu;
      
      // Try to look up by email
      const matchedUser = users?.find(u => u.email === cu.email);
      if (matchedUser) {
        return {
          ...cu,
          userId: matchedUser.id,
          firstName: cu.firstName || matchedUser.firstName,
          lastName: cu.lastName || matchedUser.lastName
        };
      }
      return cu;
    });

    const submitData: ProjectFormSubmitData = {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      primarySe: data.primarySe || undefined,
      ...projectTeamSubmitValues(data.teamId, data.subteamId, isEdit),
      specialistSe: data.specialistSe && data.specialistSe !== "none" ? data.specialistSe : undefined,
      supportingSalesEngineers: data.supportingSalesEngineers || undefined,
      accountRepresentative: data.accountRepresentative || undefined,
      opportunityEngineer: data.opportunityEngineer || undefined,
      opportunityAcvValue: data.opportunityAcvValue || "",
      tccUserId: data.tccUserId || undefined,
      uploadedFiles: uploadedFiles.length > 0 ? uploadedFiles : data.uploadedFiles,
      customerUsers: enrichedCustomerUsers,
      additionalAccess: selectedAdditionalAccess,
      projectLinks: projectLinks,
      mapTemplateId: selectedMapTemplate?.id || undefined,
      projectCompetingWith: projectCompetingWith,
    };

    console.log("Submitting project data...");
    onSubmit(submitData);
  };

  // Use template handling hook
  const { handleTemplateSelection } = useTemplateHandling({
    form,
    toast,
    onSolutionChange,
    setSelectedDocuments,
    setUploadedFiles,
    setProjectLinks,
    setPlannedWorkingDays,
  });

  const handleUploadSubmit = async () => {
    if (!uploadFormData.file || !uploadFormData.givenName || !uploadFormData.documentType) {
      showWarningToast("Missing Fields", "Please fill in all required fields");
      return;
    }

    // Check file size limit (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (uploadFormData.file.size > maxSize) {
      showWarningToast("File Too Large", "File size must be less than 5MB");
      return;
    }

    try {
      // Upload to server using FormData to ensure consistent storage
      const formData = new FormData();
      formData.append('file', uploadFormData.file);
      formData.append('folder', 'uploads_documents'); // Consistent folder
      formData.append('givenName', uploadFormData.givenName);
      formData.append('description', uploadFormData.description || '');
      formData.append('documentType', uploadFormData.documentType);
      formData.append('solutionIds', JSON.stringify(uploadFormData.solutionIds)); // Send solution IDs as JSON string
      formData.append('owner', user?.role || 'Unknown');
      formData.append('ownerId', user?.id || '');

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to upload document');
      }

      const documentRecord = await response.json();

      // Create file object for form
      const documentAsFile = {
        name: uploadFormData.givenName,
        givenName: uploadFormData.givenName,
        originalName: uploadFormData.file.name,
        fileName: documentRecord.fileName, // Use server-generated filename
        fileType: uploadFormData.file.type,
        fileSize: uploadFormData.file.size,
        description: uploadFormData.description,
        documentType: uploadFormData.documentType,
        filePath: documentRecord.filePath, // Server path
        documentId: documentRecord.id, // Link to database record
        uploadedAt: new Date().toISOString(),
        uploadedBy: user?.id || 'unknown'
      };

      console.log("Document uploaded successfully:", documentAsFile);

      // Add to uploadedFiles array
      const newFiles: UploadedFileEntry[] = [...uploadedFiles, documentAsFile];
      setUploadedFiles(newFiles);
      form.setValue("uploadedFiles", newFiles, { shouldDirty: true });

      // Reset form and close dialog
      setUploadFormData({
        givenName: "",
        description: "",
        documentType: "",
        solutionIds: [],
        file: null
      });
      setIsUploadDialogOpen(false);

      showSuccessToast("Document Uploaded", "Document uploaded successfully!");
    } catch (error) {
      console.error("Error uploading document:", error);
      showErrorToast("Upload Failed", error instanceof Error ? error.message : "Error uploading document");
    }
  };

  return (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit, scrollToFirstError)} className="space-y-4">
        {/* Guided Overview Banner with Jump to Section dropdown */}
        <GuidedOverviewBanner
          accountName={watchedValues.customerName}
          projectType={watchedValues.type}
          environment={watchedValues.environment}
          startDate={watchedValues.startDate}
          endDate={watchedValues.endDate}
          acvValue={watchedValues.opportunityAcvValue}
          primaryEngineerName={(() => {
            const primarySeId = watchedValues.primarySe;
            if (!primarySeId) return undefined;
            const engineer = users.find((u: any) => String(u.id) === String(primarySeId));
            if (engineer) {
              const firstName = engineer.firstName || '';
              const lastName = engineer.lastName || '';
              return (firstName + ' ' + lastName).trim() || engineer.email;
            }
            return undefined;
          })()}
          solutions={Array.isArray(watchedValues.solutionName) ? watchedValues.solutionName : []}
          products={products as any[]}
          sections={sectionsInfo}
          onJumpToSection={jumpToSection}
          editModeControls={editModeControls}
          riskLevel={riskLevel}
          riskLevelConfigs={riskLevelConfigs}
          activeSectionId={activeSectionId}
          projectName={watchedValues.projectName}
          onProjectNameChange={handleProjectNameChange}
          isProjectNameManuallyEdited={isProjectNameManuallyEdited}
          projectId={projectId}
          competingWith={projectCompetingWith}
          mapTemplateName={selectedMapTemplate?.name}
          validationCriteriaTemplateName={validationCriteriaTemplateName}
          showValidationCriteria={true}
          selectedCustomerId={selectedCustomerId ?? null}
          accountLogoUrl={accountLogoUrl}
          infrastructureProfileId={watchedValues.infrastructureProfileId ?? null}
          onInfrastructureProfileChange={handleInfrastructureProfileChange}
        />

        {/* No-accounts gate alert — shown in create mode when no accounts exist yet */}
        {hasNoAccounts && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 [&>svg]:text-red-600! dark:[&>svg]:text-red-400!">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle className="text-amber-800 dark:text-amber-300">No Accounts Found</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span className="text-amber-700 dark:text-amber-400">
                To create a project, you need to create an Account first. All steps are locked until an account exists.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40 gap-1.5"
                onClick={() => setIsCreateCustomerDialogOpen(true)}
              >
                <Building2 className="h-4 w-4" />
                Create Account
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Use Template - Only show in create mode (plain variant - not a numbered section) */}
        {!isEdit && (
        <GuidedFormSection
          id="section-template"
          title="Utilize a Template"
          icon={<FolderSymlink className="h-5 w-5" />}
          description="Load data from an existing project template"
          isOpen={openSections.template}
          onToggle={() => toggleSection('template')}
          variant="plain"
        >
          <div className="space-y-4">
            <div>
               <div className="flex items-center gap-2 pb-2">
              <FolderOpenDot className="h-4 w-4 text-blue-600 shrink-0" />
              <Label htmlFor="template-select" className="dark:text-slate-200">Project Template</Label>
                </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 pb-2">
                Selecting a template will populate the form fields with pre-configured values. You can modify them as needed.
              </p>
              <Select onValueChange={handleTemplateSelection}>
                <SelectTrigger id="template-select" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                  <SelectValue placeholder="Select a pre-configured project template to auto-populate the form (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const activeTemplates = templates.filter((t: any) => t.isActive !== false);
                    const userId = user?.id;
                    const myTemplates = activeTemplates.filter((t: any) => t.isSystem === false && String(t.createdBy) === String(userId));
                    const customTemplates = activeTemplates.filter((t: any) => t.isSystem === false && String(t.createdBy) !== String(userId));
                    const systemTemplates = activeTemplates.filter((t: any) => t.isSystem !== false);

                    const groups = [
                      { label: "My Templates", items: myTemplates },
                      { label: "Custom", items: customTemplates },
                      { label: "System", items: systemTemplates },
                    ].filter(g => g.items.length > 0);

                    return groups.map((group, groupIdx) => (
                      <div key={group.label}>
                        {groupIdx > 0 && <SelectSeparator />}
                        <SelectGroup>
                          <SelectLabel className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.label}</SelectLabel>
                          {group.items.map((template: any) => (
                            <SelectItem key={template.id} value={template.id}>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{template.name}</span>
                                  {template.mapTemplateName || template.mapTemplateId
                                    ? <Waypoints size={14} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
                                    : <GlobeX size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
                                  }
                                </div>
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                  {template.environment || template.industry || 'CloudLAB'} {template.type || template.solutionType || 'POC'}: {template.projectTimeline || template.estimatedDuration || '2-3 weeks'}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </div>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
          </div>
        </GuidedFormSection>
        )}

        {/* Project Essentials */}
        <GuidedFormSection
          id="section-essentials"
          stepNumber={1}
          title="Project Essentials"
          icon={<Info className="h-5 w-5" />}
          isOpen={openSections.essentials}
          onToggle={() => toggleSection('essentials')}
          completedFields={getSectionCompletion.essentials.completed}
          totalRequiredFields={getSectionCompletion.essentials.total}
          color="blue"
          description="Capture the foundation of the project; the account/customer, solutions evaluated, competitors and industry, and links to SalesForce aligning the source of sales truth."
          disabled={hasNoAccounts}
        >
          <EssentialsSection
            form={form}
            isEdit={isEdit}
            customers={customers}
            industries={industries}
            products={products}
            filteredSolutions={filteredSolutions}
            selectedCustomer={selectedCustomer}
            infrastructureProfileId={watchedValues.infrastructureProfileId ?? null}
            onInfrastructureProfileChange={handleInfrastructureProfileChange}
            industryComplianceRegulations={industryComplianceRegulations}
            allTags={allTags}
            tagInput={tagInput}
            setTagInput={setTagInput}
            suggestedTags={suggestedTags}
            suggestedTagsIndex={suggestedTagsIndex}
            setSuggestedTagsIndex={setSuggestedTagsIndex}
            handleAddTag={handleAddTag}
            handleRemoveTag={handleRemoveTag}
            updateSuggestedTags={updateSuggestedTags}
            onSolutionChange={onSolutionChange}
            setIsCreateCustomerDialogOpen={(open) => {
              setCrmPrefillUrl(undefined);
              setAccountToLink(null);
              setIsCreateCustomerDialogOpen(open);
            }}
            onCreateAccountFromCrm={(url) => {
              setAccountToLink(null);
              setCrmPrefillUrl(url);
              setIsCreateCustomerDialogOpen(true);
            }}
            onLinkAccountToCrm={async (customerId, url) => {
              const account =
                customers.find((c: any) => c.id === customerId) ??
                (await apiRequest("GET", `/api/customers/${customerId}`).catch(() => null));
              if (!account) return;
              setAccountToLink(account);
              setCrmPrefillUrl(url);
              setIsCreateCustomerDialogOpen(true);
            }}
            projectId={projectId}
            projectCompetingWith={projectCompetingWith}
            setProjectCompetingWith={setProjectCompetingWith}
          />
        </GuidedFormSection>

        {/* Project Timeline */}
        <GuidedFormSection
          id="section-timeline"
          stepNumber={2}
          title="Project Timeline"
          icon={<Calendar className="h-5 w-5" />}
          isOpen={openSections.timeline}
          onToggle={() => toggleSection('timeline')}
          completedFields={getSectionCompletion.timeline.completed}
          totalRequiredFields={getSectionCompletion.timeline.total}
          color="green"
          description="Set the planned start, target milestones, and end date so the team has a working delivery cadence and shared expectations."
          disabled={hasNoAccounts}
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="dark:text-slate-200">Start Date <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field}
                        className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                        onChange={(e) => {
                          field.onChange(e);
                          // Auto-update end date only when creating new projects (not editing):
                          // the template's duration in working days, skipping weekends and default holidays.
                          if (e.target.value && !isEdit) {
                            form.setValue("endDate", addWorkingDays(e.target.value, plannedWorkingDays, workingCalendar));
                          }
                        }}
                      />
                    </FormControl>
                    {!field.value && !isEdit && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Suggested: {formatDateForInput(new Date())} (Today)
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="dark:text-slate-200">End Date <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
                    </FormControl>
                    {!field.value && !isEdit && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("projects.form.endDateSuggested", {
                          date: addWorkingDays(toIsoDate(new Date()), plannedWorkingDays, workingCalendar),
                          count: plannedWorkingDays,
                        })}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* FIXED: Dark mode support for Timeline Summary Box */}
              <div className="rounded-lg p-4 bg-[#f5fcff] dark:bg-slate-800/50 border dark:border-slate-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Calendar1 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Total Days</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-800 dark:text-blue-400">
                      {calculateTotalDays(watchedStartDate || "", watchedEndDate || "")}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <BriefcaseBusiness className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{t("projects.form.totalWorkingDays")}</span>
                    </div>
                    <div className="text-2xl font-bold text-green-800 dark:text-green-400">
                      {countWorkingDays(watchedStartDate || "", watchedEndDate || "", workingCalendar)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GuidedFormSection>

        {/* Project Team */}
        <GuidedFormSection
          id="section-team"
          stepNumber={3}
          title="Internal Team"
          icon={<Users className="h-5 w-5" />}
          isOpen={openSections.team}
          onToggle={() => toggleSection('team')}
          completedFields={getSectionCompletion.team.completed}
          totalRequiredFields={getSectionCompletion.team.total}
          color="purple"
          description="Assign the internal delivery team responsible for owning, supporting, and guiding the project through execution."
          disabled={hasNoAccounts}
        >
          <TeamSection
            form={form}
            users={users}
            roles={roles}
            selectedSupportingEngineers={selectedSupportingEngineers}
            setSelectedSupportingEngineers={setSelectedSupportingEngineers}
            selectedAdditionalSupportingTeam={selectedAdditionalSupportingTeam}
            setSelectedAdditionalSupportingTeam={setSelectedAdditionalSupportingTeam}
          />
        </GuidedFormSection>

        {/* No-account-users gate alert — shown when the selected account has no eligible users */}
        {hasNoAccountUsers && !hasNoAccounts && (
          <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-300">No Account Users Found</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span className="text-blue-700 dark:text-blue-400">
                {selectedCustomerName} has no users yet. Create a user and assign them to this account to enable Account Access.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-blue-400 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/40"
                onClick={() => setIsCreateUserDialogOpen(true)}
              >
                Create User
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Account Access & Permissions (renamed from Customer Access & Permissions) */}
        <GuidedFormSection
          id="section-access"
          stepNumber={4}
          title="Account Access & Permissions"
          icon={<UserLock className="h-5 w-5" />}
          isOpen={openSections.access}
          onToggle={() => toggleSection('access')}
          completedFields={getSectionCompletion.access.completed}
          totalRequiredFields={getSectionCompletion.access.total}
          color="amber"
          description="Define who from the account needs access, what they can see or do, and who is authorized to participate in the project. Users in red will not be able to login until approved."
          disabled={hasNoAccounts || hasNoAccountUsers}
        >
          <AccessSection
            form={form}
            users={users}
            roles={roles}
            customers={customers}
            selectedCustomerUsers={selectedCustomerUsers}
            setSelectedCustomerUsers={setSelectedCustomerUsers}
            selectedAdditionalAccess={selectedAdditionalAccess}
            setSelectedAdditionalAccess={setSelectedAdditionalAccess}
            setIsCreateUserDialogOpen={setIsCreateUserDialogOpen}
            updateStakeholderTypesMutation={updateStakeholderTypesMutation}
            customerUsersForTcc={customerUsersForTcc}
          />
        </GuidedFormSection>

        {/* Stakeholder Requirements */}
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
          description="Document the business and stakeholder needs, objectives, and compliance expectations that the project must address."
          disabled={hasNoAccounts}
        >
          <RequirementsSection
            form={form}
            complianceRegulations={complianceRegulations}
            toast={toast}
          />
        </GuidedFormSection>

        <GuidedFormSection
            id="section-plan"
            stepNumber={6}
            title={t("mapPlan.form.title")}
            icon={<Waypoints className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
            isOpen={openSections.plan}
            onToggle={() => toggleSection('plan')}
            completedFields={getSectionCompletion.plan.completed}
            totalRequiredFields={getSectionCompletion.plan.total}
            color="cyan"
            description={t("mapPlan.form.description")}
            disabled={hasNoAccounts}
            headerActions={
              // A saved project opens its plan in the MAP drawer (a Quick plan
              // or a template when it has none yet).
              projectId ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsMapDrawerOpen(true)}
                  className="bg-primary hover:bg-primary/90"
                >
                  <CircuitBoard className="h-4 w-4 mr-2" />
                  {t("mapPlan.form.editMap")}
                </Button>
              ) : undefined
            }
          >
              {selectedMapTemplate ? (
                <MapTemplateSummary
                  templateName={selectedMapTemplate.name}
                  description={selectedMapTemplate.description}
                  phaseCount={selectedMapTemplate.phaseCount}
                  stepCount={selectedMapTemplate.stepCount}
                  taskCount={selectedMapTemplate.taskCount}
                  onDelete={handleRemoveMapTemplate || (() => {})}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-gray-300 rounded-lg dark:border-slate-700">
                  <Waypoints className="h-8 w-8 text-gray-400 dark:text-slate-500 mb-4" />
                  <p className="text-gray-500 mb-1 dark:text-slate-400">{t("mapPlan.form.noTemplate")}</p>
                  <p className="text-xs text-gray-500 mb-4 dark:text-slate-400 max-w-md">{t("mapPlan.form.quickPlanHint")}</p>
                  {!projectId && (
                    <Button
                      type="button"
                      onClick={() => setIsMapTemplateSelectorOpen?.(true)}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Waypoints className="h-4 w-4 mr-2" />
                      {t("mapPlan.form.useTemplate")}
                    </Button>
                  )}
                </div>
              )}
        </GuidedFormSection>

        {/* Project Artifacts (Documents and Links) */}
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
          description="Attach the documents, links, and supporting materials needed to run the project and keep everyone aligned."
          disabled={hasNoAccounts}
        >
          <ArtifactsSection
            form={form}
            products={products}
            uploadedFiles={uploadedFiles}
            setUploadedFiles={setUploadedFiles}
            projectLinks={projectLinks}
            setProjectLinks={setProjectLinks}
            isUploadDialogOpen={isUploadDialogOpen}
            setIsUploadDialogOpen={setIsUploadDialogOpen}
            uploadFormData={uploadFormData}
            setUploadFormData={setUploadFormData}
            handleUploadSubmit={handleUploadSubmit}
          />
        </GuidedFormSection>

        {/* Validation Criteria - Section 8 — gated until at least 1 solution is selected */}
        {validationSectionContent && (
          <GuidedFormSection
            id="section-validation"
            stepNumber={8}
            title="Validation Criteria"
            icon={<CircleCheckBig className="h-5 w-5" />}
            isOpen={isValidationSectionOpen ?? openSections.validation}
            onToggle={onValidationSectionToggle ?? (() => toggleSection('validation'))}
            completedFields={getSectionCompletion.validation.completed}
            totalRequiredFields={getSectionCompletion.validation.total}
            color="brand"
            description={
              !hasSolutionsSelected
                ? "Select at least one Solution in Step 1 to configure Validation Criteria."
                : "Define how success will be measured, including the specific outcomes, tests, and proof points required to validate the solution."
            }
            disabled={hasNoAccounts || !hasSolutionsSelected}
          >
            {validationSectionContent}
          </GuidedFormSection>
        )}

        {assumptionsSectionContent && (
          <GuidedFormSection
            id="section-assumptionsDeps"
            stepNumber={9}
            title="Assumptions & Dependencies"
            icon={<ShieldCheck className="h-5 w-5" />}
            isOpen={isAssumptionsSectionOpen ?? openSections.assumptionsDeps}
            onToggle={onAssumptionsSectionToggle ?? (() => toggleSection('assumptionsDeps'))}
            completedFields={getSectionCompletion.assumptionsDeps.completed}
            totalRequiredFields={getSectionCompletion.assumptionsDeps.total}
            color="forest"
            description={'The "physics settings" of the Project. They answer: What must be true, available, or permitted for this to be valid?'}
            disabled={hasNoAccounts}
          >
            {assumptionsSectionContent}
          </GuidedFormSection>
        )}

      </form>
    </Form>

    {/* Solution Removal Confirmation Dialog */}
    <AlertDialog open={confirmationDialog.isOpen} onOpenChange={(open) => 
      setConfirmationDialog(prev => ({ ...prev, isOpen: open }))
    }>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Solution with Success Criteria?</AlertDialogTitle>
          <AlertDialogDescription>
            The solution "{confirmationDialog.solutionName}" has {confirmationDialog.criteriaCount} associated success criteria. 
            Removing this solution will also permanently delete all of its success criteria.
            <br /><br />
            This action cannot be undone. Are you sure you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmationDialog.onConfirm}
            className="bg-red-600 hover:bg-red-700"
          >
            Remove Solution & Criteria
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* MAP Drawer */}
    {projectId && (
      <MapDrawer
        open={isMapDrawerOpen}
        onOpenChange={(open) => {
          setIsMapDrawerOpen(open);
        }}
        projectId={projectId}
      />
    )}

    {/* Create Customer Dialog */}
    <CreateCustomerDialog
      isOpen={isCreateCustomerDialogOpen}
      editingCustomer={accountToLink}
      initialCrmUrl={crmPrefillUrl}
      onClose={() => {
        setIsCreateCustomerDialogOpen(false);
        setCrmPrefillUrl(undefined);
        setAccountToLink(null);
      }}
      onCustomerCreated={(accountName) => {
        queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
        setIsCreateCustomerDialogOpen(false);
        setCrmPrefillUrl(undefined);
        setAccountToLink(null);
        // Auto-select the newly created customer
        if (accountName) {
          form.setValue("customerName", accountName, { shouldValidate: true });
        }
        // Auto-open Step 1 so the user can continue filling in the form immediately
        jumpToSection('essentials');
      }}
    />

    {/* Create User Dialog */}
    <CreateUserDialog
      isOpen={isCreateUserDialogOpen}
      onClose={() => setIsCreateUserDialogOpen(false)}
      onUserCreated={(userData) => {
        queryClient.invalidateQueries({ queryKey: ['/api/users'] });
        // Auto-add the newly created user to selected customer users
        if (userData && !selectedCustomerUsers.some(u => u.userId === userData.id)) {
          setSelectedCustomerUsers(prev => [...prev, {
            userId: userData.id,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            permission: "view"
          }]);
        }
      }}
    />
    </>
  );
}