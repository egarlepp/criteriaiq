import React from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, LayoutDashboard, Target, CheckCircle, Users, Building2, FolderOpen, FolderOpenDot, FolderTree, BarChart3, Brain, Settings, FileText, User, Building, BookOpen, HelpCircle, Package, FileCog, Link, SquareTerminal } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from 'react-i18next';
import { Header } from "./header";
import { SecondTierNav } from "./second-tier-nav";
import { SectionTabBar } from "./section-tab-bar";
import { SIDEBAR_NAV, isItemActive } from "./sidebar-nav-config";
import { PersonaBanner } from "./PersonaBanner";
import { EnvSourceWarningBanner } from "./EnvSourceWarningBanner";
import { DataDirReadOnlyBanner } from "./DataDirReadOnlyBanner";
import { MaintenanceBanner } from "./MaintenanceBanner";
import PageErrorBoundary from "@/components/errors/page-error-boundary";
import { useState, useEffect } from "react";
import EvaluationRequestDialog from "@/components/requests/EvaluationRequestDialog";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCrmProvider } from '@/hooks/use-crm-provider';
import { usePageViewTracking } from '@/hooks/use-page-view-tracking';

const SECTION_HEADER_PATHS = ["/project", "/account", "/admin", "/about"];

interface PageLayoutProps {
  children: React.ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  const [location, setLocation] = useLocation();
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const { t } = useTranslation();
  const [dynamicDataState, setDynamicDataState] = useState<any>(null); // Renamed to avoid conflict
  const [isEvaluationDialogOpen, setIsEvaluationDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  // Loads the install's CRM once for every page, which fills {{crm}} in the
  // wording everywhere.
  useCrmProvider();

  // PageLayout stays mounted across navigations (App.tsx renders it once
  // around the routes), so a new page starts scrolled to the top here.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location]);

  // The audit page title names the project's customer.
  const [isAuditRoute, auditParams] = useRoute("/project/:id/audit");
  const auditProjectId = isAuditRoute ? auditParams.id : null;
  const { data: auditProject } = useQuery<{ customerName?: string }>({
    queryKey: [`/api/projects/${auditProjectId}`],
    enabled: auditProjectId !== null && !isNaN(parseInt(auditProjectId)),
  });
  const customerName = auditProject?.customerName;

  // Listen for dashboard view changes and force re-render
  useEffect(() => {
    if (location === "/") {
      const handler = () => forceUpdate();
      window.addEventListener("dashboard-actions-updated", handler);
      return () => window.removeEventListener("dashboard-actions-updated", handler);
    }
  }, [location]);

  // Use wouter's useSearch for reactive URL query parameter handling
  const search = useSearch();
  usePageViewTracking(location, search);
  const currentProjectTab = React.useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get('tab');
  }, [search]);

  // These pages host several sidebar entries (e.g. /project holds Project
  // Workspace, Account Management, Knowledge and Outcome Intelligence; /admin
  // holds every Admin category); the header names whichever one is open.
  const sectionHeader = React.useMemo(() => {
    if (!SECTION_HEADER_PATHS.includes(location)) return undefined;
    const query = search ? `?${search}` : "";
    return SIDEBAR_NAV.flatMap((g) => g.items).find((item) => isItemActive(item, location, query));
  }, [location, search]);

  // Get the appropriate icon for the current page
  const getPageIcon = () => {
    switch (location) {
      case "/":
        return LayoutDashboard;
      case "/create":
      case "/create-project":
        return Plus;
      case "/project":
        return sectionHeader?.icon ?? Target;
      case "/success-criteria":
        return CheckCircle;
      case "/account":
        return sectionHeader?.icon ?? Building2;
      case "/artifacts":
        return FolderOpen;
      case "/templates":
        return FolderTree;
      case "/reports":
        return BarChart3;
      case "/ai-risk":
      case "/ai-risk-management":
        return Brain;
      case "/admin":
        return sectionHeader?.icon ?? Settings;
      case "/getting-started":
        return BookOpen;
      case "/about":
        return sectionHeader?.icon ?? SquareTerminal;
      case "/edit-template":
        return FolderOpen;
      default:
        if (location.startsWith("/project-detail/") || location.startsWith("/project/")) {
          return Target;
        }
        return Target; // Default for validation projects
    }
  };

  // Define header props based on current route
  const getHeaderProps = () => {
    const PageIcon = getPageIcon();

    switch (location) {
      case "/":
        const dashboardActions = (window as any).dashboardActions;
        const activeView = dashboardActions?.activeView || "main";

        return {
          title: t("nav.dashboard"),
          subtitle: "",
          icon: PageIcon,
          customButtons: (activeView === "users" || activeView === "customers") ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => dashboardActions?.setIsCreateUserDialogOpen(true)} className="bg-primary hover:bg-primary/90">
                    <Users className="h-4 w-4 mr-2" />
                    {t("users.createUser")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-white dark:bg-slate-800 text-black dark:text-slate-100 text-xs px-2 py-1 border border-gray-200 dark:border-slate-700 shadow-md">
                  {t("users.createUserTooltip")}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => dashboardActions?.setIsCreateCustomerDialogOpen(true)} className="bg-primary hover:bg-primary/90">
                    <Building className="h-4 w-4 mr-2" />
                    {t("header.createCustomer")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-white dark:bg-slate-800 text-black dark:text-slate-100 text-xs px-2 py-1 border border-gray-200 dark:border-slate-700 shadow-md">
                  {t("customers.createCustomerTooltip")}
                </TooltipContent>
              </Tooltip>
            </>
          ) : undefined
        };
      case "/create":
      case "/create-project":
        return {
          title: t("nav.createProject"),
          subtitle: "",
          icon: PageIcon
        };
      case "/templates":
        return {
          title: t("nav.templateManagement", "Template Management"),
          subtitle: "",
          icon: PageIcon
        };
      case "/artifacts":
        return {
          title: t("nav.artifacts"),
          subtitle: "",
          icon: PageIcon,
          customButtons: (
            <>
              <Button onClick={() => {
                console.log("Create template clicked");
                const trigger = document.querySelector('[data-create-template]');
                if (trigger) {
                  (trigger as HTMLElement).click();
                } else {
                  console.log("No create template trigger found");
                }
              }} className="bg-primary hover:bg-primary/90">
                <FolderOpenDot className="h-4 w-4 mr-2" />
                {t("templates.createTemplate")}
              </Button>
              <Button onClick={() => {
                console.log("Upload document clicked");
                const trigger = document.querySelector('[data-upload-document]');
                if (trigger) {
                  (trigger as HTMLElement).click();
                } else {
                  console.log("No upload document trigger found");
                }
              }} className="bg-primary hover:bg-primary/90">
                <FileText className="h-4 w-4 mr-2" />
                {t("layout.pageLayout.uploadDocument")}
              </Button>
              <Button onClick={() => {
                console.log("Create link clicked");
                const trigger = document.querySelector('[data-create-link]');
                if (trigger) {
                  (trigger as HTMLElement).click();
                } else {
                  console.log("No create link trigger found");
                }
              }} className="bg-primary hover:bg-primary/90">
                <Link className="h-4 w-4 mr-2" />
                {t("layout.pageLayout.createLink")}
              </Button>
            </>
          )
        };
      case "/success-criteria":
        return {
          title: t("nav.validationCriteria"),
          subtitle: "",
          icon: PageIcon
        };
      case "/account":
        return {
          title: sectionHeader ? t(sectionHeader.labelKey) : t("nav.accountManagement"),
          subtitle: "",
          icon: PageIcon
        };
      case "/reports":
        return {
          title: t("layout.sidebar.items.reports"),
          subtitle: "",
          icon: PageIcon
        };
      case "/admin":
        return {
          title: sectionHeader ? t(sectionHeader.labelKey) : t("layout.sidebar.groups.admin"),
          subtitle: "",
          icon: PageIcon
        };
      case "/getting-started":
        return {
          title: t("nav.gettingStarted"),
          subtitle: "",
          icon: PageIcon
        };
      case "/about":
        return {
          title: sectionHeader ? t(sectionHeader.labelKey) : t("about.title"),
          subtitle: "",
          icon: PageIcon
        };
      case "/edit-template":
        return {
          title: t("templates.editTemplate"),
          subtitle: "",
          icon: PageIcon,
          customButtons: (
            <Button onClick={() => setLocation("/templates?tab=project-templates")} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("layout.pageLayout.backToProjectTemplates")}
            </Button>
          )
        };
      case "/ai-risk":
      case "/ai-risk-management":
        return {
          title: t("nav.aiRisk"),
          subtitle: "",
          icon: PageIcon
        };
      case "/project":
        return {
          title: sectionHeader ? t(sectionHeader.labelKey) : t("nav.projectsWorkspace"),
          subtitle: "",
          icon: PageIcon
        };
      default:
        if (location.startsWith("/project-detail/") || location.startsWith("/project/")) {
          // Check if this is an audit route
          if (location.match(/\/project\/\d+\/audit$/)) {
            const projectId = location.split('/')[2];
                        const title = customerName
              ? t("layout.pageLayout.auditOfProjectWithCustomer", { projectId, customerName })
              : t("layout.pageLayout.auditOfProject", { projectId });
            return {
              title: title,
              subtitle: "",
              icon: PageIcon
            };
          }

          const title = t("projects.projectDetails");
          return {
            title: title,
            subtitle: "",
            icon: PageIcon,
          };
        } else if (location.startsWith("/project/")) {
                    return {
            title: customerName ? `${t("projects.projectDetails")} - ${customerName}` : t("projects.projectDetails"),
            subtitle: "",
            icon: PageIcon
          };
        }
        return {
          title: t("nav.validationProjects"),
          subtitle: "",
          icon: PageIcon
        };
    }
  };

  const headerProps = getHeaderProps();

  const handleEvaluationDialogClose = () => {
    setIsEvaluationDialogOpen(false);
  };

  const handleRequestCreated = () => {
    // Invalidate queries to refresh any request counts or lists
    queryClient.invalidateQueries({ queryKey: ['/api/evaluation-requests'] });
    setIsEvaluationDialogOpen(false);
  };

  return (
    <div className="flex flex-col h-full print:block print:h-auto">
      <Header 
        title={headerProps.title}
        subtitle={headerProps.subtitle}
        icon={headerProps.icon}
        customButtons={headerProps.customButtons}
      />
      <div className="print:hidden">
        <MaintenanceBanner />
        <PersonaBanner />
        <DataDirReadOnlyBanner />
        <EnvSourceWarningBanner />
      </div>
      <div className="flex flex-1 min-h-0 print:block">
        <SecondTierNav />
        <div ref={scrollRef} className="@container/main flex-1 min-w-0 overflow-y-auto relative project-form-scroll page-scroll-content print:overflow-visible print:!p-0" style={{ padding: '0 80px 24px 80px' }}>
          {/* Page background logo */}
          <div className="page-background-logo"></div>

          {/* Content wrapper with error boundary */}
          <div className="relative">
            <SectionTabBar />
            {/* Keyed by path so an error on one page clears when you leave it. */}
            <PageErrorBoundary key={location} pageName={headerProps.title}>
              {children}
            </PageErrorBoundary>
          </div>
        </div>
      </div>

      {/* Evaluation Request Dialog */}
      <EvaluationRequestDialog
        isOpen={isEvaluationDialogOpen}
        onClose={handleEvaluationDialogClose}
        selectedCustomerId={undefined}
        onRequestCreated={handleRequestCreated}
      />
    </div>
  );
}