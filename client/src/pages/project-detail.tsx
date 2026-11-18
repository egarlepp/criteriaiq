import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect, type ReactNode } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useCustomerStatusConfigRealtime } from "@/hooks/useConfigRealtime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowLeft, Lock, Save, Target as TargetIcon, FolderOpen, Trash2, Download, Upload, CircleCheckBig, ExternalLink, Settings, Route, Waypoints, Handshake, Clock, AlertTriangle, CheckCircle, XCircle, CircleArrowUp, OctagonPause, Siren, CircleAlert, ClipboardClock, BadgeHelp, ClockAlert, Hourglass, MessageCircleWarning, Binoculars, Pin, LayoutList, Activity, ChevronDown, ChevronRight, HandHeart, Component, Boxes, Link2, Files, Building } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import { apiRequest } from "@/lib/queryClient";
import { UploadDocumentDialog } from "@/components/artifacts/UploadDocumentDialog";
// jsPDF (~400 kB) and html2canvas (~200 kB) are only needed when the user
// clicks "Download PDF". They are dynamically imported inside `downloadPDF`
// below so they stay out of the initial project-detail bundle.
type Html2CanvasFn = typeof import("html2canvas").default;
type JsPDFCtor = typeof import("jspdf").default;
type JsPDFInstance = InstanceType<JsPDFCtor>;

async function loadPdfTooling(): Promise<{
  html2canvas: Html2CanvasFn;
  jsPDF: JsPDFCtor;
}> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  return { html2canvas, jsPDF };
}
import { formatFullName } from "@/lib/nameUtils";
import { MapDrawer } from "@/components/project-form/MapDrawer";
import { MapProgressIndicator } from "@/components/map/MapProgressIndicator";
import { MapActivityTimeline } from "@/components/map/MapActivityTimeline";
import { useMapAnalytics } from "@/hooks/useMapAnalytics";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { MAP_STATUS_CONFIG, type MapStatus } from "@/types/map";
import { EndDateBadge } from "@/components/shared/end-date-badge";
import { TAPDrawer, TAPButton } from "@/components/project-detail/TAPDrawer";
import { GapAnalysisTab } from "@/components/project-detail/GapAnalysisTab";
import { AssumptionsDependenciesTab, type DependencyRecord, type SuccessCriterion as DepSuccessCriterion, type Product as DepProduct } from "@/components/project-detail/AssumptionsDependenciesTab";
import { ProjectIQCoach } from "@/components/project-detail/ProjectIQCoach";
import { CriterionDependenciesDrawer } from "@/components/project-detail/CriterionDependenciesDrawer";
import { CriteriaComponentRow, CriteriaStatusPill, CriteriaStatusSelect, CriteriaTableHeadRow, CRITERIA_ROW_CLASS, useCriteriaRowSort } from "@/components/validation-criteria/criteria-table-parts";
import { AlignVerticalSpaceAround, Bot, ShieldCheck } from "lucide-react";
import { DeliverabilityVisibilityModal } from "@/components/project-detail/DeliverabilityVisibilityModal";
import { JourneyStageTrack } from "@/components/value-journey/JourneyStageTrack";
import { ProjectOutcomePrompt } from "@/components/outcomes/ProjectOutcomePrompt";
import { ImpactiqEffortCard } from "@/components/project-detail/ImpactiqEffortCard";
import { ProjectHero, HERO_TAB_CLASS, HERO_TAB_HIDDEN_CLASS, HERO_TABS_LIST_CLASS } from "@/components/project-detail/ProjectHero";
import { ProjectHeroStatus, type CustomerStatusOption } from "@/components/project-detail/ProjectHeroStatus";
import { ProjectWorkspaceOverview } from "@/components/customer-workspace/ProjectWorkspaceOverview";
import { ValueJourneyCard } from "@/components/customer-workspace/ValueJourneyCard";
import { HandoffTeamCard } from "@/components/value-journey/HandoffTeamCard";
import { AfterActionReviewCard } from "@/components/value-journey/AfterActionReviewCard";
import { ProjectBriefCard } from "@/components/customer-workspace/ProjectBriefCard";
import { teamContacts } from "@/components/customer-workspace/workspace-utils";
import { criteriaProgress, scheduleProgress } from "@/components/project-detail/project-overview-utils";
import { customerActionsKey, type CustomerActionRow } from "@/lib/customer-actions";
import { CriteriaAgreementBar } from "@/components/value-journey/CriteriaAgreementBar";
import { CriterionPlanLine } from "@/components/value-journey/CriterionPlanLine";
import { CriterionPriorityButton } from "@/components/value-journey/CriterionPriorityButton";
import { invalidateProjectJourney, useCriteriaAgreement } from "@/components/value-journey/use-value-journey";
import { documentTypeIcon, linkTypeIcon } from "@/components/artifacts/artifact-type-icons";
import { cn } from "@/lib/utils";
import { redirectToSignIn } from "@/lib/sign-in-redirect";

// Helper function to capitalize first letter of role name
const capitalizeRole = (role: string | null | undefined): string => {
  if (!role) return '';
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
};

// Helper function to get additional project team members
const getAdditionalProjectTeam = (project: any, mapAssignments: any[], engineers: any[]) => {
  if (!project) return [];

  const teamMembers = new Map();
  const excludedRoles = ['engineer', 'sales', 'customer'];

  // Process MAP assignments
  if (Array.isArray(mapAssignments)) {
    mapAssignments.forEach((assignment: any) => {
      if (assignment.user && assignment.user.role) {
        const role = assignment.user.role.toLowerCase();
        if (!excludedRoles.includes(role)) {
          const userId = assignment.user.id;
          if (!teamMembers.has(userId)) {
            teamMembers.set(userId, {
              userId: userId,
              firstName: assignment.user.firstName,
              lastName: assignment.user.lastName,
              role: assignment.user.role,
            });
          }
        }
      }
    });
  }

  // Process additionalAccess from project
  if (project.additionalAccess && Array.isArray(project.additionalAccess)) {
    project.additionalAccess.forEach((access: any) => {
      const userId = access.userId;
      const user = Array.isArray(engineers) ? engineers.find((e: any) => e.id === userId) : null;

      if (user && user.role) {
        const role = user.role.toLowerCase();
        if (!excludedRoles.includes(role)) {
          if (!teamMembers.has(userId)) {
            teamMembers.set(userId, {
              userId: userId,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
            });
          }
        }
      }
    });
  }

  return Array.from(teamMembers.values());
};

export default function ProjectDetail() {
  const { t, i18n } = useTranslation();
  const [, params] = useRoute("/project/:id");
  const [location, setLocation] = useLocation();
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  

  // Listen for real-time customer status config updates
  useCustomerStatusConfigRealtime();

  // Status configuration aligned with MAP Phase/Steps/Tasks
  const criteriaStatusConfig = {
    not_started: { 
      label: "Not Started", 
      icon: Clock,
      textColor: "text-gray-600 dark:text-gray-400",
      description: "Validation hasn't begun; no execution steps performed and no evidence collected yet."
    },
    in_progress: { 
      label: "In Progress", 
      icon: TargetIcon,
      textColor: "text-blue-600 dark:text-blue-400",
      description: "Validation is actively underway; steps are being executed and/or evidence is being gathered."
    },
    blocked: { 
      label: "Blocked", 
      icon: AlertTriangle,
      textColor: "text-red-600 dark:text-red-400",
      description: "Validation can't proceed due to a gating issue or dependency not met (typically a missing prerequisite like access, data, logging, or integration)."
    },
    complete: { 
      label: "Complete", 
      icon: CheckCircle,
      textColor: "text-green-600 dark:text-green-400",
      description: "Validation activities are finished and the item has a final result with supporting evidence recorded."
    },
    deferred: { 
      label: "Deferred", 
      icon: CircleArrowUp,
      textColor: "text-yellow-600 dark:text-yellow-400",
      description: "Validation is intentionally postponed (out of current scope/phase), to be revisited later."
    },
    stalled: { 
      label: "Stalled", 
      icon: OctagonPause,
      textColor: "text-orange-600 dark:text-orange-400",
      description: "Validation started but has stopped progressing due to unresolved issues or lack of traction (not fully blocked, but not moving)."
    },
    at_risk: { 
      label: "At Risk", 
      icon: Siren,
      textColor: "text-purple-600 dark:text-purple-400",
      description: "Validation is likely to miss timeline or success criteria unless corrective action is taken (known risks, open gaps, or tight dependencies)."
    },
    cancelled: { 
      label: "Cancelled", 
      icon: XCircle,
      textColor: "text-gray-600 dark:text-gray-400",
      description: "Validation will not be performed (scope change, no longer needed, or superseded)."
    },
    fail: {
      label: "Fail",
      icon: CircleAlert,
      textColor: "text-red-400 dark:text-red-300",
      description: "Test was executed with prerequisites satisfied and assumptions valid, but the success threshold was not met."
    }
  };

  const [accessLevel, setAccessLevel] = useState<'read' | 'edit' | 'view' | 'none'>('none');
  const [criteriaUpdates, setCriteriaUpdates] = useState<{[key: number]: string}>({});
  const [collapsedCriteriaGroups, setCollapsedCriteriaGroups] = useState<Set<string>>(new Set());
  const { sortConfig: criteriaSortConfig, handleSort: handleCriteriaSort, sortCriteriaRows } = useCriteriaRowSort("pscTable");
  const toggleCriteriaGroup = (solutionName: string) => {
    setCollapsedCriteriaGroups(prev => {
      const next = new Set(prev);
      if (next.has(solutionName)) next.delete(solutionName);
      else next.add(solutionName);
      return next;
    });
  };
  const [customerStatusValue, setCustomerStatusValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [isTAPDrawerOpen, setIsTAPDrawerOpen] = useState(false);
  
  // Delete document confirmation state
  const [deleteDocConfirmOpen, setDeleteDocConfirmOpen] = useState(false);
  const [pendingDeleteDocId, setPendingDeleteDocId] = useState<number | null>(null);

  // Criterion dependencies drawer state
  const [criterionDrawerOpen, setCriterionDrawerOpen] = useState(false);
  const [criterionDrawerLineNumber, setCriterionDrawerLineNumber] = useState(0);
  const [criterionDrawerText, setCriterionDrawerText] = useState("");
  const [criterionDrawerDeps, setCriterionDrawerDeps] = useState<DependencyRecord[]>([]);
  const [allDepsDrawerOpen, setAllDepsDrawerOpen] = useState(false);

  const queryClient = useQueryClient();

  const projectId = params?.id ? parseInt(params.id) : null;

  // Get the source parameter from URL to determine where user came from
  const getSourceFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('source') || 'projects';
  };

  // Get dynamic back navigation info based on source
  const getBackNavigation = () => {
    const source = getSourceFromUrl();

    switch (source) {
      case 'dashboard':
        return {
          href: '/',
          label: t('projects.backToDashboard'),
          tooltip: 'Return to the main dashboard'
        };
      case 'account-portal':
        return {
          href: '/account',
          label: t('projects.backToAccountPortal'),
          tooltip: 'Return to the account portal'
        };
      case 'projects':
      case 'validation-projects':
      default:
        return {
          href: '/project',
          label: t('projects.backToValidationProjects'),
          tooltip: 'Return to the validation projects list'
        };
    }
  };

  const backNavigation = getBackNavigation();

  // PDF download function
  const downloadPDF = async () => {
    if (!project) return;

    setDownloadingPDF(true);

    // Helper: sleep
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Lazy-load the PDF/canvas libraries on first use.
    const { html2canvas, jsPDF } = await loadPdfTooling();

    // Helper: add a canvas to the PDF, splitting across A4 pages as needed
    const addCanvasToPDF = (canvas: HTMLCanvasElement, pdf: JsPDFInstance, isFirst: boolean) => {
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = 297; // A4 height in mm

      if (imgHeight > pageHeight) {
        const totalPages = Math.ceil(imgHeight / pageHeight);
        for (let i = 0; i < totalPages; i++) {
          if (!isFirst || i > 0) pdf.addPage();
          const yPosition = -(i * pageHeight * canvas.width / imgWidth);
          pdf.addImage(imgData, 'PNG', 0, yPosition, imgWidth, imgHeight);
        }
      } else {
        if (!isFirst) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      }
    };

    try {
      const originalScrollY = window.scrollY;
      const originalActiveTab = activeTab;

      // Scroll to top before any capture
      window.scrollTo(0, 0);
      await sleep(150);

      const captureArea = document.querySelector('.pdf-capture-area') as HTMLElement;
      const tabsSection = document.querySelector('.pdf-tabs-section') as HTMLElement;

      if (!captureArea) throw new Error('PDF capture area not found');

      // ── Step 1: Capture the header section (hide tabs section temporarily) ──
      if (tabsSection) {
        tabsSection.style.visibility = 'hidden';
        tabsSection.style.height = '0px';
        tabsSection.style.overflow = 'hidden';
        tabsSection.style.marginTop = '0px';
      }
      await sleep(100);

      const headerCanvas = await html2canvas(captureArea, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        height: captureArea.scrollHeight,
        width: captureArea.scrollWidth,
        scrollX: 0,
        scrollY: 0,
        windowWidth: captureArea.scrollWidth,
        windowHeight: captureArea.scrollHeight,
      });

      // Restore tabs section
      if (tabsSection) {
        tabsSection.style.visibility = '';
        tabsSection.style.height = '';
        tabsSection.style.overflow = '';
        tabsSection.style.marginTop = '';
      }
      await sleep(150);

      // ── Step 2: Discover visible tab triggers (DOM-only = role-gated tabs auto-excluded) ──
      const tabTriggers = Array.from(
        document.querySelectorAll('[role="tab"]')
      ) as HTMLElement[];

      // ── Step 3: Capture each visible tab's content ──
      const tabCanvases: HTMLCanvasElement[] = [];

      for (const trigger of tabTriggers) {
        const tabValue = (trigger as HTMLElement).dataset.tabValue;
        if (!tabValue) continue;

        // Use React's state setter directly — .click() does not reliably fire
        // Radix UI's onValueChange from JavaScript, so the active tab would never change.
        setActiveTab(tabValue);

        // Wait for React to commit the state change and for the browser to repaint
        await new Promise(resolve => requestAnimationFrame(resolve));
        await sleep(300);

        const captureTarget = tabsSection;
        if (!captureTarget) continue;

        const canvas = await html2canvas(captureTarget, {
          scale: 1.5,
          useCORS: true,
          allowTaint: true,
          height: captureTarget.scrollHeight,
          width: captureTarget.scrollWidth,
          scrollX: 0,
          scrollY: 0,
          windowWidth: captureTarget.scrollWidth,
          windowHeight: captureTarget.scrollHeight,
        });
        tabCanvases.push(canvas);
      }

      // ── Step 4: Restore original tab and scroll position ──
      setActiveTab(originalActiveTab);
      window.scrollTo(0, originalScrollY);

      // ── Step 5: Build PDF ──
      const pdf = new jsPDF('p', 'mm', 'a4');

      addCanvasToPDF(headerCanvas, pdf, true);
      for (const canvas of tabCanvases) {
        addCanvasToPDF(canvas, pdf, false);
      }

      const filename = `${project.customerName}_Project_${project.businessObjective || 'Details'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);

      showSuccessToast("PDF Downloaded", "Project details saved as PDF — header + all visible tabs included");
    } catch (error) {
      console.error('Error generating PDF:', error);
      showErrorToast("Download Failed", "Unable to generate PDF. Please try again.");
    } finally {
      setDownloadingPDF(false);
    }
  };

  // Fetch project details
  const { data: project, isLoading } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch project');
      }
      return response.json();
    },
    enabled: isAuthenticated && projectId !== null,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0, // Always refetch when component mounts
  });

  // Fetch project MAP data
  const { data: mapData, refetch: refetchMapData } = useQuery({
    queryKey: ["/api/projects", projectId, "map"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/map`);
      if (!response.ok) {
        if (response.status === 404) {
          return { phases: [], steps: [], tasks: [] };
        }
        throw new Error('Failed to fetch project MAP data');
      }
      return response.json();
    },
    enabled: isAuthenticated && projectId !== null,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0, // Always refetch when component mounts
  });

  // Open MAP tasks owned by the customer side, for the Overview tab.
  const { data: customerActions = [], isLoading: customerActionsLoading } = useQuery<CustomerActionRow[]>({
    queryKey: customerActionsKey("projects", projectId),
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/customer-actions`);
      if (!response.ok) throw new Error('Failed to fetch customer actions');
      return response.json();
    },
    enabled: isAuthenticated && projectId !== null,
    refetchOnWindowFocus: true,
  });

  // Fetch MAP analytics for enhanced progress tracking
  const { data: mapAnalytics, refetch: refetchMapAnalytics } = useMapAnalytics(
    projectId || 0, 
    isAuthenticated && projectId !== null && !!mapData
  );

  // Deliverables visibility helpers
  const isExternalRole = ['customer', 'partner', 'guest'].includes(user?.role?.toLowerCase() ?? '');
  const { data: criteriaAgreement } = useCriteriaAgreement(projectId);
  // A criterion's priority or the MAP phase that tests it, saved as soon as it changes.
  const criterionPlacementMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; priority?: string; mapPhaseId?: number | null }) =>
      apiRequest('PATCH', `/api/success-criteria/${id}`, body),
    onSuccess: () => {
      if (projectId) invalidateProjectJourney(queryClient, projectId);
    },
    onError: () => showErrorToast('common.error', 'valueJourney.criteria.saveFailed'),
  });
  const isAdminUser = user?.role?.toLowerCase() === 'admin';
  const rawDeliverablesVisibility = (project as any)?.deliverablesVisibility as { cardVisible?: boolean; tabs?: Record<string, boolean> } | null | undefined;
  const delivVisibility = {
    cardVisible: rawDeliverablesVisibility?.cardVisible ?? true,
    tabs: {
      map: rawDeliverablesVisibility?.tabs?.map ?? true,
      'success-criteria': rawDeliverablesVisibility?.tabs?.['success-criteria'] ?? true,
      artifacts: rawDeliverablesVisibility?.tabs?.artifacts ?? true,
      'projectiq-coach': rawDeliverablesVisibility?.tabs?.['projectiq-coach'] ?? false,
      gaps: rawDeliverablesVisibility?.tabs?.gaps ?? false,
      'assumptions-dependencies': rawDeliverablesVisibility?.tabs?.['assumptions-dependencies'] ?? true,
    } as Record<string, boolean>,
  };
  const ADMIN_ONLY_TABS = ['projectiq-coach', 'gaps'];
  const isTabVisible = (key: string): boolean => delivVisibility.cardVisible && (delivVisibility.tabs[key] ?? (ADMIN_ONLY_TABS.includes(key) ? false : true));

  // Set the active tab when the project loads, or from the URL param
  useEffect(() => {
    if (project) {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      const validTabs = ['overview', 'map', 'success-criteria', 'gaps', 'gap-analysis', 'artifacts', 'projectiq-coach', 'infrastructure', 'activity', 'assumptions-dependencies'];
      if (tabParam === 'gap-analysis') {
        setActiveTab('gaps');
      } else if (tabParam && validTabs.includes(tabParam)) {
        setActiveTab(tabParam);
      } else if (!tabParam) {
        // The Overview tab (status summary, KPIs, what is waiting on the customer) opens first.
        setActiveTab('overview');
      }
    }
  }, [project?.id, location]);

  // Fetch current user's permissions for this project
  const { data: userPermissions = [] } = useQuery({
    queryKey: ["/api/user-permissions"],
    enabled: isAuthenticated,
  });

  // Fetch customer access permissions for this project
  const { data: customerAccess = [] } = useQuery({
    queryKey: ["/api/customer-access", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/customer-access/${projectId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch customer access');
      }
      return response.json();
    },
    enabled: isAuthenticated && projectId !== null,
  });

  // Fetch status configurations for color mapping
  const { data: statusConfigs = [] } = useQuery({
    queryKey: ["/api/status-configs"],
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0, // Always refetch when component mounts
  });

  // Fetch customer status configurations for dynamic dropdown
  const { data: customerStatusConfigs = [] } = useQuery({
    queryKey: ["/api/customer-status-configs"],
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0, // Always refetch when component mounts
  });

  // Fetch all documents for display in Customer Artifacts
  const { data: allDocuments = [] } = useQuery({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated,
    staleTime: 0, // Always refetch when component mounts
  });

  // Fetch all engineers for dropdowns
  const { data: engineers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
  });

  // Fetch all products/solutions for icon display
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
    staleTime: 0, // Always refetch when component mounts
  });

  // Helper function to get product info (name and icon) from products database
  const getProductInfo = (solutionName: string) => {
    const allProducts = Array.isArray(products) ? products : [];

    // Try exact match first
    let product = allProducts.find((p: any) => p.name === solutionName);

    // If no exact match, try case-insensitive match
    if (!product) {
      product = allProducts.find((p: any) => p.name.toLowerCase() === solutionName.toLowerCase());
    }

    // If still no match, try partial matching (e.g., "Acme Auditor" matches "Auditor")
    if (!product) {
      const lowerSolution = solutionName.toLowerCase();
      product = allProducts.find((p: any) => {
        const lowerProduct = p.name.toLowerCase();
        // Check if solution name contains product name or vice versa
        return lowerSolution.includes(lowerProduct) || lowerProduct.includes(lowerSolution);
      });
    }

    // Return the current product name and icon from database, or fallback to template name
    return {
      name: product?.name || solutionName,
      solutionIcon: product?.solutionIcon, solutionIconName: product?.solutionIconName ?? null
    };
  };

  // Fetch compliance regulations for displaying selected regulations
  const { data: complianceRegulations = [] } = useQuery({
    queryKey: ["/api/compliance-regulations"],
    enabled: isAuthenticated,
    staleTime: 0, // Always refetch when component mounts
  });

  // Fetch MAP assignments for the project
  const { data: mapAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "map", "assignments"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/map/assignments`);
      if (!response.ok) {
        throw new Error('Failed to fetch MAP assignments');
      }
      return response.json();
    },
    enabled: isAuthenticated && projectId !== null,
    staleTime: 0,
  });

  // Fetch project dependencies (for Success Criteria line highlighting)
  const { data: projectDepsForCriteria = [] } = useQuery<DependencyRecord[]>({
    queryKey: [`/api/project-dependencies`, { projectId }],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/project-dependencies?projectId=${projectId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated && projectId !== null,
    staleTime: 30000,
  });

  // Fetch customer artifacts for the dropdown
  const { data: customerArtifacts = [] } = useQuery({
    queryKey: ["/api/customers", project?.customerId, "documents"],
    queryFn: async () => {
      if (!project?.customerId) return [];
      const response = await fetch(`/api/customers/${project.customerId}/documents`);
      if (!response.ok) {
        throw new Error('Failed to fetch customer artifacts');
      }
      return response.json();
    },
    enabled: isAuthenticated && !!project?.customerId,
    staleTime: 0, // Always refetch when component mounts
  });

  // Mutation for updating success criteria
  const updateCriteriaMutation = useMutation({
    mutationFn: async (updates: {id: number, status: string}[]) => {
      const promises = updates.map(update => 
        apiRequest('PATCH', `/api/success-criteria/${update.id}`, { status: update.status })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      if (projectId) invalidateProjectJourney(queryClient, projectId);
      setCriteriaUpdates({});
      showSuccessToast("Success", "Success criteria updated successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to update success criteria");
    },
  });

  // Mutation for updating project notes
  const updateNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      return apiRequest('PATCH', `/api/projects/${projectId}`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      showSuccessToast('workspace.notes.saved');
    },
    onError: () => {
      showErrorToast('workspace.notes.saveFailedTitle', 'workspace.notes.saveFailed');
    },
  });

  // Mutation for updating customer status
  const updateCustomerStatusMutation = useMutation({
    mutationFn: async (customerStatus: string) => {
      return apiRequest('PATCH', `/api/projects/${projectId}`, { customerStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      showSuccessToast("Success", "Customer status updated successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to update customer status");
    },
  });

  // Mutation for uploading customer artifacts
  const uploadArtifactMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // Use customer-specific endpoint if project has a customer
      if (project?.customerId) {
        const response = await fetch(`/api/customers/${project.customerId}/documents`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          throw new Error('Failed to upload file');
        }
        return response.json();
      } else {
        // Fallback to project-specific endpoint for legacy projects
        const response = await fetch(`/api/projects/${projectId}/customer-artifacts`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          throw new Error('Failed to upload file');
        }
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      if (project?.customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/customers", project.customerId, "documents"] });
      }
      showSuccessToast("Success", "File uploaded successfully");
      setUploading(false);
    },
    onError: () => {
      showErrorToast("Error", "Failed to upload file");
      setUploading(false);
    },
  });

  // Mutation for deleting documents
  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      return apiRequest('DELETE', `/api/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      showSuccessToast("Success", "Document deleted successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to delete document");
    },
  });

  // Determine user's access level for this project
  const getUserAccessLevel = () => {
    if (!project || !user) return 'none';

    // Check if user is the assigned SE (full edit access)
    if (project.assignedSeId === user.id) {
      return 'edit';
    }

    // Check if user has SE role (full edit access)
    if (user.role === 'Engineer' || user.role === 'Admin') {
      return 'edit';
    }

    // Check if user is in customer access list
    const userAccess = customerAccess.find((access: any) => access.userEmail === user.email);
    if (userAccess) {
      return userAccess.permission.toLowerCase() as 'edit' | 'view';
    }

    // Check user permissions for general access
    const hasAccess = Array.isArray(userPermissions) ? userPermissions.some((permission: any) => 
      permission.userId === user.id && 
      permission.sections?.includes('project')
    ) : false;

    return hasAccess ? 'view' : 'none';
  };

  // Update access level when dependencies change
  useEffect(() => {
    // Only update access level when we have the essential data and authentication is complete
    if (project && user && isAuthenticated && !authLoading) {
      const level = getUserAccessLevel();
      setAccessLevel(level);
    }
  }, [project, user, customerAccess, userPermissions, isAuthenticated, authLoading]);

  // Initialize notes and customer status values when project loads
  useEffect(() => {
    if (project) {
      setCustomerStatusValue(project.customerStatus || 'On Time');
    }
  }, [project]);

  // Add event listeners for header button actions
  useEffect(() => {
    const handleDownloadPDF = () => {
      downloadPDF();
    };

    const handleSaveUpdates = () => {
      if (Object.keys(criteriaUpdates).length > 0) {
        const updates = Object.entries(criteriaUpdates).map(([id, status]) => ({
          id: parseInt(id),
          status
        }));
        updateCriteriaMutation.mutate(updates);
      }
    };

    const handleNavigateBack = () => {
      const backNavigation = getBackNavigation();
      setLocation(backNavigation.href);
    };

    // Add event listeners
    window.addEventListener('downloadProjectPDF', handleDownloadPDF);
    window.addEventListener('saveProjectUpdates', handleSaveUpdates);
    window.addEventListener('navigateBackFromProject', handleNavigateBack);

    // Show/hide save button based on state
    const saveBtn = document.getElementById('save-updates-btn');
    if (saveBtn) {
      saveBtn.style.display = (accessLevel === 'edit' && Object.keys(criteriaUpdates).length > 0) ? 'inline-flex' : 'none';
    }

    // Cleanup event listeners
    return () => {
      window.removeEventListener('downloadProjectPDF', handleDownloadPDF);
      window.removeEventListener('saveProjectUpdates', handleSaveUpdates);
      window.removeEventListener('navigateBackFromProject', handleNavigateBack);
    };
  }, [criteriaUpdates, accessLevel, downloadPDF, updateCriteriaMutation, getBackNavigation]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToSignIn();
      return;
    }
  }, [isAuthenticated, authLoading]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen">
        <div className="max-w-6xl mx-auto py-6 px-4">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-slate-400">{t('projects.loadingProjectDetails')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen">
        <div className="max-w-6xl mx-auto py-6 px-4">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-4">{t('projects.projectNotFound')}</h2>
            <p className="text-gray-600 dark:text-slate-400 mb-6">{t('projects.projectNotFoundMessage')}</p>
            <Link href={backNavigation.href}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      {backNavigation.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{backNavigation.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (accessLevel === 'none') {
    return (
      <div className="min-h-screen">
        <div className="max-w-6xl mx-auto py-6 px-4">
          <div className="text-center py-12">
            <Lock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-4">{t('projects.accessDenied')}</h2>
            <p className="text-gray-600 dark:text-slate-400 mb-6">{t('projects.accessDeniedMessage')}</p>
            <Link href={backNavigation.href}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      {backNavigation.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{backNavigation.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Header band and Overview tab (project view redesign, option B) ──
  const userTimezone = user?.timezone || 'America/New_York';
  const criteriaStats = criteriaProgress(project.successCriteria);
  const schedule = scheduleProgress(project.startDate, project.endDate);
  // Customer-side tasks come from the MAP; outside users only see them when
  // the MAP tab is shared with them.
  const showPlanToViewer = !isExternalRole || isTabVisible('map');
  const showDeliverableTabs = !isExternalRole || delivVisibility.cardVisible;
  const visibleCustomerActions: CustomerActionRow[] = showPlanToViewer ? customerActions : [];
  const internalStatusConfig = Array.isArray(statusConfigs)
    ? (statusConfigs as Array<{ name: string; color?: string | null; icon?: string | null }>).find((config) => {
        const projectStatus = project.status?.toLowerCase();
        return config.name.toLowerCase().replace(/\s+/g, '_') === projectStatus || config.name.toLowerCase() === projectStatus;
      }) ?? null
    : null;
  const canSeeSalesStage = !authLoading && !!user?.role && !['customer', 'guest'].includes(user.role.toLowerCase());
  const canManageSharing = !authLoading && !!user?.role && ['engineer', 'admin'].includes(user.role.toLowerCase());
  const approverText = (() => {
    const fullName = project.tccFirstName && project.tccLastName ? `${project.tccFirstName} ${project.tccLastName}` : '';
    if (fullName && project.tccCommitteeApproval) return t('projectView.hero.approverCommitteeAnd', { name: fullName });
    if (fullName) return fullName;
    if (project.tccCommitteeApproval) return t('projectView.hero.approverCommittee');
    return t('projectView.hero.approverNotDefined');
  })();
  const solutionBadges = (() => {
    if (Array.isArray(project.successCriteria) && project.successCriteria.length > 0) {
      const uniqueProducts = new Map<string, { graphic: string | null; icon: string | null }>();
      project.successCriteria.forEach((criteria: any) => {
        if (criteria.productName && !uniqueProducts.has(criteria.productName)) {
          uniqueProducts.set(criteria.productName, { graphic: criteria.solutionIcon, icon: criteria.solutionIconName ?? null });
        }
      });
      return Array.from(uniqueProducts.entries()).map(([productName, mark]) => (
        <SolutionBadge key={productName} solutionName={productName} solutionIcon={mark.graphic} solutionIconName={mark.icon} />
      ));
    }
    if (project.solutionName) {
      return <SolutionBadge solutionName={project.solutionName} solutionIcon={project.solutionIcon} />;
    }
    return <span className="text-xs opacity-80">{t('common.notSpecified')}</span>;
  })();
  // Team card: our side (named roles, then everyone else on the project) and
  // the customer's people with access, Project Admins first.
  const userList: any[] = Array.isArray(engineers) ? engineers : [];
  const ourContacts = teamContacts([
    { role: t('workspace.team.roleSe'), person: project.primarySe ?? project.assignedSe },
    { role: t('workspace.team.roleEngineer'), person: project.opportunityEngineer },
    { role: t('workspace.team.roleRep'), person: project.accountRepresentative },
    { role: t('workspace.team.roleSpecialist'), person: project.specialistSe },
    ...(Array.isArray(project.supportingSalesEngineers) ? project.supportingSalesEngineers : []).map((person: any) => ({
      role: t('workspace.team.roleSupporting'),
      person,
    })),
    ...(Array.isArray(project.additionalSupportingTeam) ? project.additionalSupportingTeam : []).map((person: any) => ({
      role: person.role || t('workspace.team.roleSupporting'),
      person,
    })),
    ...getAdditionalProjectTeam(project, mapAssignments, userList).map((member: any) => ({
      role: capitalizeRole(member.role),
      person: { ...member, email: userList.find((u: any) => u.id === member.userId)?.email ?? null },
    })),
  ]);
  const customerContacts = teamContacts(
    (Array.isArray(customerAccess) ? [...customerAccess] : [])
      .map((access: any) => {
        const matched = userList.find((u: any) => u.email === access.userEmail);
        const stakeholderTypes: string[] = Array.isArray(matched?.stakeholderTypes) ? matched.stakeholderTypes : [];
        return { access, matched, stakeholderTypes };
      })
      // Staff given customer access (an Admin testing the view) are not the customer's people.
      .filter(({ matched }) => !matched?.role || ['customer', 'partner', 'guest'].includes(String(matched.role).toLowerCase()))
      .sort((a, b) => (a.stakeholderTypes.includes('Project Admin') ? 0 : 1) - (b.stakeholderTypes.includes('Project Admin') ? 0 : 1))
      .map(({ access, matched, stakeholderTypes }) => ({
        role: stakeholderTypes.length > 0 ? stakeholderTypes.join(', ') : t('workspace.team.customerRole'),
        person: { firstName: matched?.firstName ?? null, lastName: matched?.lastName ?? null, email: access.userEmail ?? null },
        // Staff see who can change the project; customers don't need the tag.
        badge: isExternalRole
          ? undefined
          : access.permission?.toLowerCase() === 'edit'
            ? t('workspace.team.canEdit')
            : t('workspace.team.canView'),
      })),
    'customer',
  );
  // Success Criteria ↔ plan: the MAP phases a criterion can be tested in,
  // how many tasks test each criterion, and what changed since the
  // customer agreed to the criteria.
  const criteriaPlanPhases: Array<{ id: number; name: string }> = [...((mapData?.phases ?? []) as any[])]
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map((phase) => ({ id: phase.id, name: phase.name }));
  const criterionTaskCounts = new Map<number, number>();
  for (const link of ((mapData as any)?.taskCriteria ?? []) as Array<{ criterionId: number }>) {
    criterionTaskCounts.set(link.criterionId, (criterionTaskCounts.get(link.criterionId) ?? 0) + 1);
  }
  const agreementChanges = criteriaAgreement?.lastAgreed ? criteriaAgreement.changes : null;
  const changedSinceAgreement = (id: number): 'changed' | 'added' | null =>
    agreementChanges?.changedIds.includes(id) ? 'changed' : agreementChanges?.addedIds.includes(id) ? 'added' : null;
  const agreementContacts = (Array.isArray(project.customerUsers) ? project.customerUsers : [])
    .map((entry: any) => (entry ? String(entry.userId ?? entry.id ?? '') : ''))
    .filter((id: string) => id.length > 0)
    .map((id: string) => {
      const match = userList.find((u: any) => u.id === id);
      const name = match ? `${match.firstName ?? ''} ${match.lastName ?? ''}`.trim() || match.email : null;
      return { id, name: name || id };
    });
  const canEditCriteria = accessLevel === 'edit' && !isExternalRole;

  const regulationNames: string[] = (Array.isArray(project.complianceRegulations) ? project.complianceRegulations : [])
    .map((regId: number) => (complianceRegulations as any[])?.find((r: any) => r.id === regId)?.name)
    .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);

  const heroTab = (value: string, visibilityKey: string, icon: ReactNode, label: string) => {
    if (isExternalRole && !isTabVisible(visibilityKey)) return null;
    const hiddenFromOutside = !isExternalRole && !isTabVisible(visibilityKey);
    return (
      <TabsTrigger
        value={value}
        data-tab-value={value}
        className={`${HERO_TAB_CLASS}${hiddenFromOutside ? ` ${HERO_TAB_HIDDEN_CLASS}` : ''}`}
        title={hiddenFromOutside ? t('projectView.tabs.hiddenFromCustomers') : undefined}
      >
        {icon}
        {label}
      </TabsTrigger>
    );
  };

  return (
    <div className="min-h-screen">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="w-full max-w-none mx-auto pdf-capture-area">
        <ProjectHero
          eyebrow={
            <>
              <span className="font-semibold">{project.customerName}</span>
              <span aria-hidden="true">·</span>
              <span>{t('projectView.hero.projectId', { id: project.id })}</span>
              <span aria-hidden="true">·</span>
              <span>{project.environment || t('projectView.hero.production')}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Handshake className="h-3.5 w-3.5" />
                {t('projectView.hero.approver', { name: approverText })}
              </span>
            </>
          }
          title={project.name || project.customerName || t('projectView.hero.untitled', { id: project.id })}
          titleAdornment={
            <EndDateBadge endDate={project?.endDate || null} projectStatus={project?.status} targetField="project.endDate" />
          }
          solutions={solutionBadges}
          status={
            <ProjectHeroStatus
              customerStatusConfigs={Array.isArray(customerStatusConfigs) ? (customerStatusConfigs as CustomerStatusOption[]) : []}
              customerStatusValue={customerStatusValue}
              onCustomerStatusChange={(value) => {
                setCustomerStatusValue(value);
                updateCustomerStatusMutation.mutate(value);
              }}
              canEdit={accessLevel === 'edit'}
              internalStatus={{
                show: !isExternalRole,
                config: internalStatusConfig,
                label: internalStatusConfig?.name ?? project.status ?? null,
              }}
              salesStage={canSeeSalesStage ? project.salesStage ?? null : null}
            />
          }
          actions={
            <div className="flex items-center gap-2">
              {/* TAP Button - visible only to Engineer and Admin */}
              {canManageSharing && <div className="text-foreground"><TAPButton onClick={() => setIsTAPDrawerOpen(true)} /></div>}
              {canManageSharing && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-600 dark:text-slate-300"
                        onClick={() => setVisibilityModalOpen(true)}
                        aria-label={t('projectView.tabs.shareSettings')}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('projectView.tabs.shareSettings')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {accessLevel === 'edit' && (
                <Button
                  onClick={() => window.dispatchEvent(new CustomEvent('saveProjectUpdates'))}
                  size="sm"
                  variant="secondary"
                  id="save-updates-btn"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {t('common.saveUpdates')}
                </Button>
              )}
            </div>
          }
          // The Overview shows criteria in its own tile; the ring is for the other tabs.
          percent={activeTab !== 'overview' && criteriaStats.total > 0 ? criteriaStats.percent : null}
          percentLabel={t('projectView.hero.ringLabel', { met: criteriaStats.met, total: criteriaStats.total })}
          tabs={
            <TabsList className={HERO_TABS_LIST_CLASS}>
              <TabsTrigger value="overview" data-tab-value="overview" className={HERO_TAB_CLASS}>
                <LayoutList className="h-4 w-4" />
                {t('projectView.tabs.overview')}
              </TabsTrigger>
              {showDeliverableTabs && (
                <>
                  {heroTab('map', 'map', <Waypoints className="h-4 w-4" />, t('projectView.tabs.map'))}
                  {heroTab('success-criteria', 'success-criteria', <CircleCheckBig className="h-4 w-4" />, t('projectView.tabs.successCriteria'))}
                  {heroTab('assumptions-dependencies', 'assumptions-dependencies', <ShieldCheck className="h-4 w-4" />, t('projectView.tabs.assumptions'))}
                  {heroTab('artifacts', 'artifacts', <FolderOpen className="h-4 w-4" />, t('projectView.tabs.artifacts'))}
                  {heroTab('gaps', 'gaps', <AlignVerticalSpaceAround className="h-4 w-4" />, t('projectView.tabs.gaps'))}
                  {heroTab('projectiq-coach', 'projectiq-coach', <Bot className="h-4 w-4" />, t('projectView.tabs.coach'))}
                </>
              )}
            </TabsList>
          }
        />
      </div>
      <div className="pdf-tabs-section">
          <TabsContent value="overview" className="mt-0">
        <ProjectWorkspaceOverview
          projectId={project.id}
          projectName={project.name || t('projectView.hero.untitled', { id: project.id })}
          customerStatus={project.customerStatus ?? null}
          customerStatusConfigs={Array.isArray(customerStatusConfigs) ? (customerStatusConfigs as CustomerStatusOption[]) : []}
          criteria={criteriaStats}
          criteriaStatuses={
            !isExternalRole || isTabVisible('success-criteria')
              ? (Array.isArray(project.successCriteria) ? project.successCriteria : [])
                  .filter((c: { isActive?: boolean | null; status?: string | null }) => c.isActive !== false && (c.status ?? '').toLowerCase() !== 'cancelled')
                  .map((c: { status?: string | null }) => c.status ?? '')
              : null
          }
          schedule={schedule}
          startDate={project.startDate}
          endDate={project.endDate ?? null}
          plan={showPlanToViewer && mapData ? { phases: Array.isArray(mapData.phases) ? mapData.phases : [], tasks: Array.isArray(mapData.tasks) ? mapData.tasks : [] } : null}
          actions={visibleCustomerActions}
          actionsLoading={customerActionsLoading}
          isExternalViewer={isExternalRole}
          accountName={project.customerName}
          contacts={ourContacts}
          customerContacts={customerContacts}
          notes={{
            value: project.notes,
            canEdit: accessLevel === 'edit',
            onSave: (value: string) => updateNotesMutation.mutateAsync(value),
          }}
          journey={<ValueJourneyCard projectId={project.id} isExternalViewer={isExternalRole} onOpenCriteria={() => setActiveTab("success-criteria")} />}
          brief={
            <ProjectBriefCard
              problem={project.businessProblem}
              objective={project.customerObjective}
              solution={project.solutionDescription}
              policy={project.policyConsiderations}
              regulations={regulationNames}
              startDate={project.startDate}
              endDate={project.endDate}
              updatedAt={project.updatedAt}
              logoUrl={project.customerLogoLive || project.customerLogo}
              logoFallbackUrl={project.customerLogoLive ? project.customerLogo : null}
              accountName={project.customerName}
            />
          }
          onOpenTab={setActiveTab}
          timezone={userTimezone}
        >
        {!authLoading && user && !isExternalRole && (
          <div className="empty:hidden">
            <ProjectOutcomePrompt
              projectId={project.id}
              projectName={project.customerName || project.solutionName || `#${project.id}`}
              status={project.status}
              salesStage={project.salesStage}
            />
          </div>
        )}
        {!authLoading && user && !isExternalRole && (
          <AfterActionReviewCard
            projectId={project.id}
            projectName={project.customerName || project.solutionName || `#${project.id}`}
            status={project.status}
            salesStage={project.salesStage}
            criteria={Array.isArray(project.successCriteria) ? project.successCriteria : []}
            locale={i18n.language}
          />
        )}
        {/* The Pro Services people who take over after the sale (warm handoff) — staff only */}
        {!isExternalRole && <HandoffTeamCard projectId={project.id} canEdit={accessLevel === 'edit'} users={userList} />}
        {/* SE effort from ImpactIQ — internal users only (the route refuses everyone else too) */}
        {!isExternalRole && <ImpactiqEffortCard projectId={project.id} />}
        </ProjectWorkspaceOverview>
          </TabsContent>

        {/* Deliverable tabs — hidden from Customer/Partner/Guest when card-level visibility is set to Hide */}
        {showDeliverableTabs && (
          <>
            {activeTab !== 'overview' && (
              <div className="flex justify-end empty:hidden" data-html2canvas-ignore="true">
                <JourneyStageTrack projectId={project.id} />
              </div>
            )}

            {/* Success Criteria Tab Content */}
            <TabsContent value="success-criteria" className="mt-0">
              {project.successCriteria && project.successCriteria.length > 0 ? (
                <Card className="dark:bg-slate-900">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 dark:text-slate-100">
                  <CircleCheckBig className="h-6 w-6 text-blue-600" />
                  {t('projects.projectSuccessCriteria')} ({project.successCriteria.filter((c: any) => c.isActive !== false).length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  {Object.keys(criteriaUpdates).length > 0 && (
                    <Button 
                      onClick={() => {
                        const updates = Object.entries(criteriaUpdates).map(([id, status]) => ({
                          id: parseInt(id),
                          status
                        }));
                        updateCriteriaMutation.mutate(updates);
                      }}
                      disabled={updateCriteriaMutation.isPending}
                      size="sm"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {updateCriteriaMutation.isPending ? t('common.saving') : t('common.saveChanges')}
                    </Button>
                  )}
                  {projectDepsForCriteria.filter(d => d.showOnSuccessCriteria).length > 0 && (
                    <button
                      onClick={() => setAllDepsDrawerOpen(true)}
                      className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                      title={t('successCriteria.table.viewAllDependencies')}
                    >
                      <Link2 className="h-6 w-6" />
                      <span className="text-sm font-semibold">{projectDepsForCriteria.filter(d => d.showOnSuccessCriteria).length}</span>
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <CriteriaAgreementBar
                      projectId={project.id}
                      canSend={canEditCriteria}
                      isExternalViewer={isExternalRole}
                      contacts={agreementContacts}
                      criteria={project.successCriteria}
                      accountName={project.customerName}
                      viewerName={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.replace(/\s*\(Demo\)\s*$/, '').trim()}
                      viewerTitle={(user as any)?.title ?? null}
                      openAgreeOnLoad={new URLSearchParams(window.location.search).get('agree') === '1'}
                      onSuggestChange={() => setActiveTab('overview')}
                    />
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1"><CriterionPriorityButton priority="must_have" /> {t('valueJourney.priority.mustHave')}</span>
                      <span className="inline-flex items-center gap-1"><CriterionPriorityButton priority="nice_to_have" /> {t('valueJourney.priority.niceToHave')}</span>
                      {canEditCriteria ? <span>{t('valueJourney.priority.legendHint')}</span> : null}
                    </p>
                  </div>
                  {(() => {
                    // Filter out inactive criteria, then group by solution
                    const activeCriteria = project.successCriteria.filter((c: any) => c.isActive !== false);
                    // Build a global line number map: uses stored lineNumber when available,
                    // otherwise falls back to a global sequential counter across all solutions
                    let _globalSeq = 0;
                    const globalLineNumberMap = new Map<number, number>();
                    activeCriteria.forEach((c: any) => {
                      _globalSeq++;
                      globalLineNumberMap.set(c.id, c.lineNumber != null ? c.lineNumber : _globalSeq);
                    });
                    const groupedCriteria = activeCriteria.reduce((acc: any, criteria: any) => {
                      const solutionName = criteria.productName;
                      if (!acc[solutionName]) {
                        acc[solutionName] = [];
                      }
                      acc[solutionName].push(criteria);
                      return acc;
                    }, {});

                    return Object.entries(groupedCriteria).map(([solutionName, criteria]: [string, any]) => {
                      const isCollapsed = collapsedCriteriaGroups.has(solutionName);
                      const solution = (products as any[])?.find((p: any) => p.name === solutionName);
                      return (
                      <div key={solutionName} className="border border-purple-200 dark:border-purple-800 rounded-lg overflow-hidden shadow-sm">
                        <div
                          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                          style={{ background: 'linear-gradient(to right, #3b0764, #4c1d95)' }}
                          onClick={() => toggleCriteriaGroup(solutionName)}
                        >
                          <div className="flex items-center gap-3">
                            {solution?.solutionIcon && solution.solutionIcon !== 'none' ? (
                              <img
                                src={`/api/files/system/solution-icons/${solution.solutionIcon}`}
                                alt={solutionName}
                                className="object-contain"
                                style={{ width: '24px', height: '24px', filter: 'brightness(0) invert(1)' }}
                                onError={(e) => e.currentTarget.style.display = 'none'}
                              />
                            ) : solution?.solutionIconName ? (
                              <SolutionGraphic icon={solution.solutionIconName} className="h-5 w-5 text-purple-200 dark:text-purple-200" />
                            ) : (
                              <Boxes className="h-5 w-5 text-purple-200" />
                            )}
                            <h3 className="text-base font-semibold text-white">
                              {solutionName}
                              <span className="ml-2 text-purple-300 text-sm font-normal">({(criteria as any[]).length})</span>
                            </h3>
                          </div>
                          <div className="flex items-center gap-2">
                            {isCollapsed
                              ? <ChevronRight className="h-4 w-4 text-purple-300" />
                              : <ChevronDown className="h-4 w-4 text-purple-300" />
                            }
                          </div>
                        </div>
                        {!isCollapsed && (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <CriteriaTableHeadRow sortConfig={criteriaSortConfig} onSort={handleCriteriaSort} showActions={false} />
                            </thead>
                            <tbody>
                              {(() => {
                                const noComponentItems = sortCriteriaRows((criteria as any[]).filter((c: any) => !c.componentName));
                                const withComponentItems = (criteria as any[]).filter((c: any) => !!c.componentName);
                                const componentGroupMap = new Map<string, any[]>();
                                withComponentItems.forEach((c: any) => {
                                  const key = c.componentName as string;
                                  if (!componentGroupMap.has(key)) componentGroupMap.set(key, []);
                                  componentGroupMap.get(key)!.push(c);
                                });
                                const renderDetailRow = (criteriaItem: any) => {
                                  const lineNum = globalLineNumberMap.get(criteriaItem.id) ?? null;
                                  const linkedPinnedDeps = projectDepsForCriteria.filter(
                                    (d) => d.showOnSuccessCriteria &&
                                      (d.successCriteriaIds?.includes(criteriaItem.id) ||
                                        (d.successCriteriaId === criteriaItem.id && !(d.successCriteriaIds?.length)))
                                  );
                                  const hasPinnedDeps = linkedPinnedDeps.length > 0;
                                  const cellText = criteriaItem.isActive === false ? 'text-blue-500 dark:text-blue-400' : 'text-gray-900 dark:text-slate-200';
                                  return (
                                    <tr key={criteriaItem.id} className={CRITERIA_ROW_CLASS}>
                                      <td className="px-3 py-3 text-center align-top w-12">
                                        {hasPinnedDeps ? (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setCriterionDrawerLineNumber(lineNum ?? 0);
                                                  setCriterionDrawerText(criteriaItem.criterion || '');
                                                  setCriterionDrawerDeps(linkedPinnedDeps);
                                                  setCriterionDrawerOpen(true);
                                                }}
                                                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 text-xs font-semibold tabular-nums text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/70 transition-colors cursor-pointer"
                                              >
                                                {lineNum ?? '—'}
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">
                                              {t('successCriteria.table.linkedDependencies', { count: linkedPinnedDeps.length })}
                                            </TooltipContent>
                                          </Tooltip>
                                        ) : (
                                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-700 text-xs font-semibold tabular-nums text-gray-600 dark:text-slate-300">
                                            {lineNum ?? '—'}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-3 text-sm text-gray-500 dark:text-slate-400 align-top italic">
                                        {criteriaItem.valueMappingName || ''}
                                      </td>
                                      <td className={`px-3 py-3 text-left text-sm align-top ${cellText}`}>
                                        {criteriaItem.criterion}
                                        <CriterionPlanLine
                                          mapPhaseId={criteriaItem.mapPhaseId}
                                          phases={criteriaPlanPhases}
                                          taskCount={criterionTaskCounts.get(criteriaItem.id) ?? 0}
                                          changedSinceAgreement={changedSinceAgreement(criteriaItem.id)}
                                          onPhaseChange={canEditCriteria ? (mapPhaseId) => criterionPlacementMutation.mutate({ id: criteriaItem.id, mapPhaseId }) : undefined}
                                          disabled={criterionPlacementMutation.isPending}
                                          testId={`criterion-plan-${criteriaItem.id}`}
                                        />
                                      </td>
                                      <td className={`px-3 py-3 text-left text-sm align-top ${cellText}`}>
                                        {criteriaItem.expectedOutcome}
                                      </td>
                                      <td className={`px-3 py-3 text-left text-sm align-top ${cellText}`}>
                                        {criteriaItem.actionItem || t('successCriteria.table.noAction')}
                                      </td>
                                      <td className="px-3 py-3 align-top w-[180px]">
                                        <div className="flex items-center gap-1">
                                          <div className="min-w-0 flex-1">
                                            {accessLevel === 'edit' ? (
                                              <CriteriaStatusSelect
                                                value={criteriaUpdates[criteriaItem.id] || criteriaItem.status}
                                                onValueChange={(value) => {
                                                  setCriteriaUpdates(prev => ({
                                                    ...prev,
                                                    [criteriaItem.id]: value
                                                  }));
                                                }}
                                              />
                                            ) : (
                                              <CriteriaStatusPill status={criteriaItem.status} />
                                            )}
                                          </div>
                                          <CriterionPriorityButton
                                            priority={criteriaItem.priority}
                                            onChange={canEditCriteria ? (priority) => criterionPlacementMutation.mutate({ id: criteriaItem.id, priority }) : undefined}
                                            disabled={criterionPlacementMutation.isPending}
                                            data-testid={`criterion-priority-${criteriaItem.id}`}
                                          />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                };
                                const result: React.ReactElement[] = [];
                                noComponentItems.forEach((criteriaItem: any) => result.push(renderDetailRow(criteriaItem)));
                                componentGroupMap.forEach((items, componentName) => {
                                  result.push(<CriteriaComponentRow key={`ch-${componentName}`} name={componentName} count={items.length} colSpan={6} />);
                                  sortCriteriaRows(items).forEach((criteriaItem: any) => result.push(renderDetailRow(criteriaItem)));
                                });
                                return result;
                              })()}
                            </tbody>
                          </table>
                        </div>
                        )}
                      </div>
                      );
                    });
                  })()}
                </div>
              </CardContent>
                </Card>
              ) : (
                <Card className="dark:bg-slate-900">
                  <CardContent>
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      {t('successCriteria.table.noneForProject')}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* MAP Tab Content */}
            {mapData && mapData.phases && mapData.phases.length > 0 ? (
              <TabsContent value="map" className="mt-0">
          <Card className="dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center justify-between dark:text-slate-100">
                <div className="flex items-center gap-2">
                  <Waypoints className="h-6 w-6 text-blue-600" />
                  Mutual Action Plan (MAP)
                </div>
                <Button
                  onClick={() => {
                    setIsMapOpen(true);
                    refetchMapData(); // Refresh MAP data when opening drawer
                    refetchMapAnalytics(); // Refresh MAP analytics when opening drawer
                  }}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Waypoints className="h-4 w-4" />
                  Edit MAP
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  Track project phases, steps, and progress with our structured Mutual Action Plan.
                </div>

                {/* MAP Progress Indicator with Enhanced Analytics */}
                <MapProgressIndicator 
                  phases={mapData?.phases || []} 
                  steps={mapData?.steps || []} 
                  analytics={mapAnalytics}
                  enhanced={!!mapAnalytics}
                  compact={!mapAnalytics}
                  className="border-0 bg-gray-50 dark:bg-slate-900/50" 
                />

                {/* MAP Status Legend */}
                <div className="flex items-center flex-wrap gap-4 text-sm text-gray-500 dark:text-slate-400">
                  {Object.entries(MAP_STATUS_CONFIG).map(([status, config]) => {
                    // Map status to icon component
                    const StatusIcon = (() => {
                      switch(status as MapStatus) {
                        case 'not_started': return Clock;
                        case 'in_progress': return TargetIcon;
                        case 'blocked': return AlertTriangle;
                        case 'complete': return CheckCircle;
                        case 'deferred': return CircleArrowUp;
                        case 'stalled': return OctagonPause;
                        case 'at_risk': return Siren;
                        case 'cancelled': return XCircle;
                        default: return Clock;
                      }
                    })();

                    return (
                      <div key={status} className="flex items-center gap-2">
                        <StatusIcon className={`w-3 h-3 ${config.color.replace('bg-', 'text-')}`} />
                        <span>{config.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* MAP Activity Timeline */}
                <div className="mt-4">
                  <MapActivityTimeline projectId={projectId || 0} />
                </div>
              </div>
            </CardContent>
          </Card>
            </TabsContent>
            ) : null}

            {/* Artifacts Tab Content */}
            <TabsContent value="artifacts" className="mt-0">
          <Card className="dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-slate-100">
                <FolderOpen className="h-6 w-6 text-blue-600" />
                {t('projects.projectArtifacts')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Project Documents */}
                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-slate-300">
                    <Files className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    {t('projects.projectDocuments')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {project.customerArtifacts && project.customerArtifacts.length > 0 ? (
                      project.customerArtifacts.map((file: any, index: number) => {
                        // Parse solutionIds if it's a string
                        let solutionIds = file.documentData?.solutionIds || file.solutionIds || file.solutions;
                        if (typeof solutionIds === 'string') {
                          try {
                            solutionIds = JSON.parse(solutionIds);
                          } catch {
                            solutionIds = [];
                          }
                        }

                        const docType = file.documentData?.documentType || file.documentType || null;
                        const { icon: DocTypeIcon, color: docTypeColor } = documentTypeIcon(docType);
                        return (
                          <div
                            key={index}
                            className="relative flex flex-col overflow-hidden rounded-lg border-l-4 border-l-blue-500 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
                          >
                            {/* Right icon cutout */}
                            <div className="absolute top-0 right-0 bottom-0 w-10 flex items-center justify-center bg-blue-50 dark:bg-blue-900/20">
                              <DocTypeIcon className={cn("h-5 w-5", docTypeColor)} aria-hidden="true" />
                            </div>

                            {/* Main content — padded away from right cutout */}
                            <div className="flex flex-col flex-1 p-4 pr-12">
                              <div className="mb-3 min-w-0">
                                <h5 className="text-sm font-medium text-gray-900 dark:text-slate-200 break-words leading-snug">
                                  {file.documentData?.givenName || file.givenName || file.name || `Document ${index + 1}`}
                                </h5>
                                {(file.documentData?.description || file.description) && (
                                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">
                                    {file.documentData?.description || file.description}
                                  </p>
                                )}
                              </div>

                              <div className="space-y-2 grow">
                                {docType && (
                                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                                    <DocTypeIcon className={cn("h-3.5 w-3.5", docTypeColor)} aria-hidden="true" />
                                    {docType}
                                  </span>
                                )}

                                {solutionIds && Array.isArray(solutionIds) && solutionIds.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {solutionIds.map((solutionId: number) => {
                                      const solution = Array.isArray(products)
                                        ? (products as any[]).find((p: any) => p.id === solutionId)
                                        : null;
                                      if (!solution) return null;
                                      const productInfo = getProductInfo(solution.name);
                                      return (
                                        <SolutionBadge
                                          key={solutionId}
                                          solutionName={productInfo.name}
                                          solutionIcon={productInfo.solutionIcon} solutionIconName={productInfo.solutionIconName}
                                        />
                                      );
                                    })}
                                  </div>
                                )}

                                <div className="text-xs text-gray-500 dark:text-slate-400 truncate">
                                  {file.documentData?.fileName || file.fileName || file.originalName || 'document.pdf'}
                                </div>
                              </div>

                              <div className="mt-3 pt-3 border-t dark:border-slate-600">
                                <Button
                                  size="sm"
                                  className="w-full"
                                  onClick={() => {
                                    const fileData = file.documentData?.fileData || file.fileData;
                                    const documentId = file.documentId ?? file.documentData?.id;
                                    if (!fileData && documentId) {
                                      // Documents attached from the library (or uploaded through
                                      // the form) carry only their id; the server streams the file.
                                      const a = document.createElement('a');
                                      a.href = `/api/documents/${documentId}/download`;
                                      a.download = file.documentData?.fileName || file.fileName || file.name || '';
                                      a.click();
                                      return;
                                    }
                                    if (fileData) {
                                      try {
                                        const byteCharacters = atob(fileData.split(',')[1]);
                                        const byteNumbers = new Array(byteCharacters.length);
                                        for (let i = 0; i < byteCharacters.length; i++) {
                                          byteNumbers[i] = byteCharacters.charCodeAt(i);
                                        }
                                        const byteArray = new Uint8Array(byteNumbers);
                                        const blob = new Blob([byteArray]);
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = file.documentData?.fileName || file.fileName || file.originalName || file.givenName || file.name;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      } catch (error) {
                                        showErrorToast("Error", "Failed to download document");
                                      }
                                    }
                                  }}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  {t('common.download')}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-slate-400">{t('projects.noProjectDocumentsUploaded')}</p>
                    )}
                  </div>
                </div>

                {/* Project Links */}
                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-slate-300">
                    <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    {t('projects.projectLinks')}
                  </h4>
                  <div>
                    {project.projectLinks && project.projectLinks.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {project.projectLinks.map((link: any, index: number) => {
                          const { icon: LinkTypeIcon, color: linkTypeColor } = linkTypeIcon(link.linkType);
                          return (
                            <Badge key={index} variant="outline" className="text-xs bg-gray-100 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                title={link.linkType || undefined}
                              >
                                <LinkTypeIcon className={cn("h-3.5 w-3.5 shrink-0", linkTypeColor)} aria-hidden="true" />
                                {link.name || link.description || `Link ${index + 1}`}
                              </a>
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-slate-400">{t('projects.noProjectLinksAdded')}</p>
                    )}
                  </div>
                </div>

                {/* Customer Artifacts */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-slate-300">
                      <Building className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      {t('projects.customerArtifacts')}
                    </h4>
                    <div className="flex items-center gap-2">
                      {/* Customer Artifacts Dropdown */}
                      <Select>
                        <SelectTrigger className="w-[280px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                          <SelectValue placeholder="Select customer artifact" />
                        </SelectTrigger>
                        <SelectContent>
                          {customerArtifacts.length > 0 ? (
                            customerArtifacts.map((artifact: any) => (
                              <SelectItem key={artifact.id} value={artifact.id.toString()}>
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-medium">{artifact.givenName}</span>
                                  <span className="text-xs text-gray-500 ml-2">{artifact.documentType}</span>
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>
                              No customer artifacts available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>

                      {/* Upload Artifact Button */}
                      {accessLevel === 'edit' && (
                        <UploadDocumentDialog 
                          customerId={project?.customerId}
                          onUploadSuccess={() => {
                            queryClient.invalidateQueries({ queryKey: ["/api/customers", project?.customerId, "documents"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
                          }}
                          trigger={
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                              title="Upload Artifact"
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                          }
                        />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {Array.isArray(allDocuments) && allDocuments.filter((doc: any) => doc.projectId && doc.projectId === parseInt(String(projectId || '0'))).length > 0 ? (
                      allDocuments.filter((doc: any) => doc.projectId && doc.projectId === parseInt(String(projectId || '0'))).map((document: any) => {
                        const { icon: ArtifactTypeIcon, color: artifactTypeColor } = documentTypeIcon(document.documentType);
                        return (
                        <div key={document.id} className="flex items-center justify-between p-3 border rounded dark:border-slate-700">
                          <span className="mr-3 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                            <ArtifactTypeIcon className={cn("h-5 w-5", artifactTypeColor)} />
                          </span>
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h5 className="text-sm font-medium text-gray-900 dark:text-slate-200">{document.givenName || document.name}</h5>
                                {document.documentType && (
                                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-1 inline-block dark:bg-blue-900/30 dark:text-blue-300">
                                    {document.documentType}
                                  </span>
                                )}
                                {document.description && (
                                  <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">{document.description}</p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {/* Delete button - available for all users with edit access */}
                            {accessLevel === 'edit' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setPendingDeleteDocId(document.id);
                                  setDeleteDocConfirmOpen(true);
                                }}
                                disabled={deleteDocumentMutation.isPending}
                                className="text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={() => {
                                // Download the document
                                if (document.fileData) {
                                  try {
                                    // Handle base64 data
                                    const byteCharacters = atob(document.fileData.split(',')[1]);
                                    const byteNumbers = new Array(byteCharacters.length);
                                    for (let i = 0; i < byteCharacters.length; i++) {
                                      byteNumbers[i] = byteCharacters.charCodeAt(i);
                                    }
                                    const byteArray = new Uint8Array(byteNumbers);
                                    const blob = new Blob([byteArray]);
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = document.originalName || document.givenName || document.name;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  } catch (error) {
                                    showErrorToast("Error", "Failed to download document");
                                  }
                                }
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              {t('common.download')}
                            </Button>
                          </div>
                        </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-slate-400">{t('projects.noCustomerArtifactsAvailable')}</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
            </TabsContent>

            {/* ProjectIQ Coach Tab Content */}
            <TabsContent value="projectiq-coach" className="mt-0">
              <ProjectIQCoach />
            </TabsContent>

            {/* Gap Analysis Tab Content */}
            <TabsContent value="gaps" className="mt-0">
              <GapAnalysisTab
                projectId={parseInt(String(projectId))}
                customerId={project?.customerId ?? null}
                solutions={Array.isArray(project?.solutionName) ? project.solutionName : (project?.solutionName ? [project.solutionName] : [])}
                availableProducts={(products as any[])?.map((p: any) => ({ id: p.id, name: p.name, solutionIcon: p?.solutionIcon, solutionIconName: p?.solutionIconName ?? null })) || []}
              />
            </TabsContent>

            {/* Assumptions & Dependencies Tab Content */}
            <TabsContent value="assumptions-dependencies" className="mt-0">
              {(() => {
                const availableProds = (Array.isArray(products) ? products : []).map(
                  (p: { id: number; name: string; solutionIcon?: string | null; solutionIconName?: string | null }) => ({
                    id: p.id,
                    name: p.name,
                    solutionIcon: p?.solutionIcon ?? null, solutionIconName: p?.solutionIconName ?? null,
                  })
                );
                const solutionNames: string[] = Array.isArray(project?.solutionName)
                  ? project.solutionName
                  : project?.solutionName
                    ? String(project.solutionName).split(", ")
                    : [];
                const projectProductIds = availableProds
                  .filter((p) => solutionNames.includes(p.name))
                  .map((p) => p.id);
                return (
                  <AssumptionsDependenciesTab
                    projectId={parseInt(String(projectId))}
                    availableProducts={availableProds}
                    projectProductIds={projectProductIds}
                    projectStatus={project?.status ?? undefined}
                    projectSuccessCriteria={
                      Array.isArray(project?.successCriteria)
                        ? (project.successCriteria as Array<{
                            id: number;
                            criterion: string | null;
                            productName: string | null;
                            solutionIcon: string | null;
                            solutionIconName?: string | null;
                            lineNumber: number | null;
                            componentName: string | null;
                            valueMappingName: string | null;
                            expectedOutcome: string | null;
                            isActive: boolean | null;
                          }>)
                            .filter((sc) => sc.isActive !== false)
                            .map((sc) => ({
                              id: sc.id,
                              name: sc.criterion ?? `Criteria ${sc.id}`,
                              productName: sc.productName ?? null,
                              solutionIcon: sc.solutionIcon ?? null,
                              solutionIconName: sc.solutionIconName ?? null,
                              lineNumber: sc.lineNumber ?? null,
                              criterion: sc.criterion ?? null,
                              componentName: sc.componentName ?? null,
                              valueMappingName: sc.valueMappingName ?? null,
                              expectedOutcome: sc.expectedOutcome ?? null,
                            }))
                        : []
                    }
                  />
                );
              })()}
            </TabsContent>
          </>
        )}
        </div>
      </Tabs>

      <MapDrawer
        open={isMapOpen}
        onOpenChange={(open) => {
          setIsMapOpen(open);
          if (!open) {
            // Refresh data when drawer is closed in case there were updates
            queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map"] });
            queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map", "analytics"] });
            queryClient.invalidateQueries({ queryKey: customerActionsKey("projects", projectId) });
          }
        }}
        projectId={projectId || 0}
        accessLevel={accessLevel}
      />

      {/* TAP Drawer - Technical Activity Plan */}
      {project && (
        <TAPDrawer
          open={isTAPDrawerOpen}
          onOpenChange={(open) => setIsTAPDrawerOpen(open)}
          projectId={project.id}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/pocs/${projectId}`] });
          }}
        />
      )}

      {/* Deliverables Visibility Modal */}
      {project && (
        <DeliverabilityVisibilityModal
          open={visibilityModalOpen}
          onClose={() => setVisibilityModalOpen(false)}
          projectId={project.id}
          currentVisibility={(project as any).deliverablesVisibility}
          isAdmin={isAdminUser}
        />
      )}

      {/* Delete Document Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteDocConfirmOpen}
        onOpenChange={setDeleteDocConfirmOpen}
        title="Delete Document"
        description="Are you sure you want to delete this document?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (pendingDeleteDocId) {
            deleteDocumentMutation.mutate(pendingDeleteDocId);
            setPendingDeleteDocId(null);
          }
        }}
        onCancel={() => setPendingDeleteDocId(null)}
        variant="destructive"
      />

      {/* Criterion Dependencies Drawer */}
      <CriterionDependenciesDrawer
        open={criterionDrawerOpen}
        onClose={() => setCriterionDrawerOpen(false)}
        lineNumber={criterionDrawerLineNumber}
        criterionText={criterionDrawerText}
        deps={criterionDrawerDeps}
        products={(Array.isArray(products) ? products : []).map((p: any) => ({
          id: p.id,
          name: p.name,
          solutionIcon: p?.solutionIcon ?? null, solutionIconName: p?.solutionIconName ?? null,
        }))}
        successCriteria={
          Array.isArray(project?.successCriteria)
            ? (project.successCriteria as any[]).map((sc: any) => ({
                id: sc.id,
                name: sc.criterion ?? `Criteria ${sc.id}`,
                productName: sc.productName ?? null,
                solutionIcon: sc.solutionIcon ?? null,
                              solutionIconName: sc.solutionIconName ?? null,
                lineNumber: sc.lineNumber ?? null,
                criterion: sc.criterion ?? null,
                componentName: sc.componentName ?? null,
                valueMappingName: sc.valueMappingName ?? null,
                expectedOutcome: sc.expectedOutcome ?? null,
              }))
            : []
        }
      />

      {/* All Project Dependencies Drawer */}
      <CriterionDependenciesDrawer
        open={allDepsDrawerOpen}
        onClose={() => setAllDepsDrawerOpen(false)}
        deps={projectDepsForCriteria.filter(d => d.showOnSuccessCriteria)}
        products={(Array.isArray(products) ? products : []).map((p: any) => ({
          id: p.id,
          name: p.name,
          solutionIcon: p?.solutionIcon ?? null, solutionIconName: p?.solutionIconName ?? null,
        }))}
        successCriteria={
          Array.isArray(project?.successCriteria)
            ? (project.successCriteria as any[]).map((sc: any) => ({
                id: sc.id,
                name: sc.criterion ?? `Criteria ${sc.id}`,
                productName: sc.productName ?? null,
                solutionIcon: sc.solutionIcon ?? null,
                              solutionIconName: sc.solutionIconName ?? null,
                lineNumber: sc.lineNumber ?? null,
                criterion: sc.criterion ?? null,
                componentName: sc.componentName ?? null,
                valueMappingName: sc.valueMappingName ?? null,
                expectedOutcome: sc.expectedOutcome ?? null,
              }))
            : []
        }
      />
    </div>
  );
}