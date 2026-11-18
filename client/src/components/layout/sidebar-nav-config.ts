// Single source of truth for the sidebar menu.
//
// The sidebar is organized into job-based groups (Home, Work, Library,
// Insights, Admin, Help). Each group lists top-level items; an item may open
// ONE level of children. Anything deeper (Outcome Intelligence views, …) lives
// in the page's own "View:" switcher, not in the sidebar. In the Admin
// second-tier menu a child may list `views`, shown as the page's top tab bar.
//
// Adding, moving or renaming a menu entry is a one-place edit here. Active
// state and permission filtering are generic (see the helpers at the bottom),
// so nothing in sidebar.tsx needs to change.
//
// URLs and permission section ids are unchanged from the previous menu, so
// bookmarks, deep links and role grants keep working.
import type { LucideIcon } from "lucide-react";
import {
  Filter,
  UserCheck,
  AlertTriangle,
  TrendingUp,
  Tag,
  CalendarRange,
  Orbit,
  LayoutDashboard,
  CalendarClock,
  ChartScatter,
  Binary,
  GalleryHorizontalEnd,
  AlignHorizontalJustifyStart,
  Target,
  Plus,
  Building2,
  Users,
  Building,
  ShieldCheck,
  SquareKanban,
  Calendar,
  Waypoints,
  AlignVerticalSpaceAround,
  FolderTree,
  FolderOpenDot,
  FileCog,
  Blocks,
  ChartNetwork,
  CheckCircle,
  Package,
  PackageCheck,
  Component,
  HandHeart,
  LayoutList,
  Activity,
  Library,
  BookMarked,
  Link2,
  Swords,
  FolderOpen,
  BarChart3,
  ChartBarIncreasing,
  ChartColumnStacked,
  BrainCircuit,
  Brain,
  BookOpen,
  Mail,
  Mails,
  PencilRuler,
  Settings,
  HeartPulse,
  Settings2,
  EarthLock,
  LibraryBig,
  Milestone,
  UserCog,
  SendToBack,
  Megaphone,
  TicketsPlane,
  Webhook,
  Cloud,
  Archive,
  ArchiveRestore,
  MonitorPlay,
  SquareTerminal,
  Binoculars,
  Atom,
  BookKey,
  PocketKnife,
  Database,
  Plug,
  Shield,
  Cog,
  HardDrive,
  Gauge,
  Zap,
  Server,
  User,
  Bug,
  DatabaseZap,
  Images,
  ListOrdered,
  Combine,
  FolderGit2,
  Key,
  ArrowLeftRight,
  History,
  LogIn,
  Palette,
  SwatchBook,
  LayoutGrid,
  SpellCheck,
  ListChecks,
  UsersRound,
  Briefcase,
} from "lucide-react";
import type { GuideTopicKey } from "@/components/guide/guide-data";
import type { CrmProviderId } from "@shared/crm-provider";

export interface SidebarNavLink {
  id: string;
  /** i18n key for the label. */
  labelKey: string;
  icon: LucideIcon;
  href: string;
  /** Permission section id checked with canView(). Omitted = always visible. */
  section?: string;
  /** Only shown to Admins. */
  adminOnly?: boolean;
  /**
   * Settings pages of one CRM: shown only while it is the install's CRM
   * (Admin › Integrations › Overview › CRM).
   */
  crm?: Exclude<CrmProviderId, "none">;
  /**
   * Views of a page in a `secondTier` group (Admin). The second-tier menu
   * lists the page; its views are the page's top tab bar.
   */
  views?: SidebarNavLink[];
  /**
   * Guide topic the header's ? button opens on this page. Children inherit
   * their item's topic; pages with none open the Workspace topic.
   */
  guideTopic?: GuideTopicKey;
}

export interface SidebarNavItem extends SidebarNavLink {
  /** One level of children. Item is shown if it, or any child, is visible. */
  children?: SidebarNavLink[];
  /**
   * Project detail / edit pages carry `?source=<x>` naming the menu entry the
   * user came from; the item listing that source is highlighted there.
   * `null` matches a project detail page opened with no source.
   */
  sources?: (string | null)[];
  /** Other pathnames that should highlight this item. */
  extraPaths?: string[];
}

export interface SidebarNavGroup {
  id: string;
  /** i18n key for the small group heading. */
  labelKey: string;
  items: SidebarNavItem[];
  /**
   * Shown in the sidebar as one entry (the group label) that opens the
   * group's items in a full-height second-tier menu under the header (Admin).
   */
  secondTier?: boolean;
}

/**
 * The tab each page shows when its URL has no `tab` / `subtab` parameter.
 * Used so `/project` highlights the same entry as
 * `/project?tab=validation&subtab=projects`.
 */
export const ROUTE_DEFAULT_PARAMS: Record<string, Record<string, string>> = {
  "/project": { tab: "validation", subtab: "projects" },
  "/templates": { tab: "project-templates" },
  "/about": { tab: "introduction" },
  "/success-criteria": { tab: "solutions" },
  "/ai-risk-management": { tab: "projects" },
  "/admin": { tab: "system-health", subtab: "overview" },
};

/**
 * Default `subtab` for a page tab other than the page's default tab, so e.g.
 * `/project?tab=customers` highlights Account Directory.
 */
export const TAB_DEFAULT_PARAMS: Record<string, Record<string, string>> = {
  "/project?tab=customers": { subtab: "accounts" },
  "/admin?tab=salesforce-configuration": { subtab: "overview" },
  "/admin?tab=archive": { subtab: "log" },
  // A page tab's sub-tab can carry its own default third-level view.
  "/project?tab=validation&subtab=outcome-intelligence": { subtab2: "quadrant" },
  "/admin?tab=appearance": { subtab: "theming" },
  "/admin?tab=workflow-automation": { subtab: "automation-feed" },
  "/admin?tab=configuration": { subtab: "project-status" },
  "/admin?tab=salesforce-configuration&subtab=salesforce": { sfsubtab: "credentials" },
  "/admin?tab=salesforce-configuration&subtab=hubspot": { sfsubtab: "field-mappings" },
};

export const SIDEBAR_NAV: SidebarNavGroup[] = [
  {
    id: "home",
    labelKey: "layout.sidebar.groups.home",
    items: [
      { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, href: "/", section: "dashboard", sources: ["overview"] },
    ],
  },
  {
    id: "work",
    labelKey: "layout.sidebar.groups.work",
    items: [
      { id: "create-project", guideTopic: "projectInfo", labelKey: "nav.createProject", icon: Plus, href: "/create", section: "create", extraPaths: ["/create-project"] },
      {
        id: "projects",
        labelKey: "nav.projectsWorkspace",
        icon: Target,
        href: "/project?tab=validation&subtab=projects",
        sources: ["projects", "validation-projects", null],
        children: [
          { id: "projects-list", guideTopic: "interface", labelKey: "layout.sidebar.items.manageProjects", icon: Target, href: "/project?tab=validation&subtab=projects", section: "project.validation" },
          { id: "project-board", guideTopic: "statuses", labelKey: "layout.sidebar.items.projectBoard", icon: SquareKanban, href: "/project?tab=validation&subtab=project-board", section: "project.validation" },
          { id: "evaluation-requests", labelKey: "layout.sidebar.items.evaluationRequests", icon: PackageCheck, href: "/project?tab=validation&subtab=evaluation-requests", section: "project.validation" },
          { id: "project-schedules", labelKey: "layout.sidebar.items.projectSchedules", icon: Calendar, href: "/project?tab=validation&subtab=calendar", section: "project.validation" },
          { id: "map-management", guideTopic: "map", labelKey: "layout.sidebar.items.mapManagement", icon: Waypoints, href: "/project?tab=validation&subtab=map", section: "project.map" },
          { id: "gap-analysis", labelKey: "layout.sidebar.items.gapAnalysis", icon: AlignVerticalSpaceAround, href: "/project?tab=validation&subtab=gap-analysis", section: "project.gap-analysis" },
        ],
      },
      {
        // Main page for Customers, Guests and Partners.
        id: "account-portal", guideTopic: "interface", labelKey: "nav.accountPortal", icon: Users, href: "/account", section: "customer", sources: ["account-portal"],
      },
      {
        id: "accounts",
        labelKey: "nav.accountManagement",
        icon: Building2,
        href: "/project?tab=customers&subtab=accounts",
        children: [
          { id: "account-directory", guideTopic: "statuses", labelKey: "layout.sidebar.items.accountDirectory", icon: Building, href: "/project?tab=customers&subtab=accounts", section: "project.customers" },
          { id: "team-users", labelKey: "layout.sidebar.items.teamUsers", icon: Users, href: "/project?tab=customers&subtab=team-users", section: "project.team-users" },
        ],
      },
    ],
  },
  {
    id: "library",
    labelKey: "layout.sidebar.groups.library",
    items: [
      {
        id: "templates",
        labelKey: "nav.templateManagement",
        icon: FolderTree,
        href: "/templates",
        children: [
          { id: "project-templates", labelKey: "layout.sidebar.items.projectTemplates", icon: FolderOpenDot, href: "/templates?tab=project-templates", section: "template_management.project-templates" },
          { id: "criteria-builder", labelKey: "layout.sidebar.items.validationCriteriaBuilder", icon: Blocks, href: "/templates?tab=criteria-builder", section: "template_management.criteria-builder" },
          { id: "map-library", guideTopic: "map", labelKey: "layout.sidebar.items.mapLibrary", icon: ChartNetwork, href: "/templates?tab=map-library", section: "template_management.map-library" },
          { id: "value-journey", labelKey: "layout.sidebar.items.valueJourney", icon: Milestone, href: "/templates?tab=value-journey", section: "template_management.value-journey" },
        ],
      },
      {
        id: "validation-criteria",
        labelKey: "nav.validationCriteria",
        icon: CheckCircle,
        href: "/success-criteria",
        sources: ["validation-criteria"],
        children: [
          { id: "solutions", labelKey: "layout.sidebar.items.solutions", icon: Package, href: "/success-criteria?tab=solutions", section: "success-criteria.solutions" },
          { id: "components", labelKey: "layout.sidebar.items.components", icon: Component, href: "/success-criteria?tab=components", section: "success-criteria.components" },
          { id: "value-mapping", labelKey: "layout.sidebar.items.valueMapping", icon: HandHeart, href: "/success-criteria?tab=value-mapping", section: "success-criteria.value-mapping" },
          { id: "criteria", labelKey: "layout.sidebar.items.criteria", icon: LayoutList, href: "/success-criteria?tab=criteria", section: "success-criteria.criteria" },
          { id: "outcomes", labelKey: "layout.sidebar.items.expectedOutcomes", icon: CheckCircle, href: "/success-criteria?tab=outcomes", section: "success-criteria.outcomes" },
          { id: "actions", labelKey: "layout.sidebar.items.actionsTaken", icon: Activity, href: "/success-criteria?tab=actions", section: "success-criteria.actions" },
        ],
      },
      {
        id: "knowledge",
        labelKey: "layout.sidebar.items.knowledge",
        icon: Library,
        href: "/project?tab=validation&subtab=assumptions",
        children: [
          { id: "assumptions", labelKey: "layout.sidebar.items.assumptions", icon: BookMarked, href: "/project?tab=validation&subtab=assumptions", section: "project.assumptions" },
          { id: "dependencies", labelKey: "layout.sidebar.items.dependencies", icon: Link2, href: "/project?tab=validation&subtab=dependencies", section: "project.dependencies" },
          { id: "competitors", labelKey: "layout.sidebar.items.competitorIntelligence", icon: Swords, href: "/project?tab=validation&subtab=competitors", section: "project.competitors" },
          { id: "artifacts", labelKey: "layout.sidebar.items.artifacts", icon: FolderOpen, href: "/project?tab=artifacts", section: "project.artifacts" },
          { id: "resource-content", labelKey: "layout.sidebar.items.resourceContent", icon: LibraryBig, href: "/project?tab=resource-content", section: "project.resource-content" },
          { id: "compliance", labelKey: "layout.sidebar.items.compliance", icon: EarthLock, href: "/project?tab=compliance", section: "config.compliance" },
        ],
      },
    ],
  },
  {
    id: "insights",
    labelKey: "layout.sidebar.groups.insights",
    items: [
      {
        // One page: the report library with its schedule calendar built in
        // (Report, Dashboard and Metric Builder were archived to
        // archive/analytics-builders/). The id is the old Library entry's, so
        // Page Usage counts carry over; /analytics redirects here.
        id: "reports",
        labelKey: "layout.sidebar.items.reports",
        icon: ChartBarIncreasing,
        href: "/reports",
        section: "analytics.main",
        sources: ["analytics", "reports"],
      },
      {
        id: "outcome-intelligence",
        labelKey: "layout.sidebar.items.outcomeIntelligence",
        icon: BrainCircuit,
        href: "/project?tab=validation&subtab=outcome-intelligence",
        section: "project.outcome-intelligence",
        children: [
          { id: "outcome-intelligence-quadrant", labelKey: "layout.sidebar.items.quadrantAnalysis", icon: ChartScatter, href: "/project?tab=validation&subtab=outcome-intelligence&subtab2=quadrant", section: "project.outcome-intelligence" },
          { id: "outcome-intelligence-reasons", labelKey: "layout.sidebar.items.reasonCodes", icon: Binary, href: "/project?tab=validation&subtab=outcome-intelligence&subtab2=reasons", section: "project.outcome-intelligence" },
          { id: "outcome-intelligence-missing", labelKey: "layout.sidebar.items.missingOutcomes", icon: GalleryHorizontalEnd, href: "/project?tab=validation&subtab=outcome-intelligence&subtab2=missing", section: "project.outcome-intelligence" },
          { id: "outcome-intelligence-all", labelKey: "layout.sidebar.items.allOutcomes", icon: AlignHorizontalJustifyStart, href: "/project?tab=validation&subtab=outcome-intelligence&subtab2=all", section: "project.outcome-intelligence" },
        ],
      },
      {
        id: "ai-assessments",
        labelKey: "nav.aiRisk",
        icon: Brain,
        href: "/ai-risk-management",
        sources: ["ai-risk"],
        children: [
          { id: "project-analysis", labelKey: "layout.sidebar.items.projectAnalysis", icon: Target, href: "/ai-risk-management?tab=projects", section: "ai-risk.projects" },
          { id: "assessment-criteria", labelKey: "layout.sidebar.items.assessmentCriteria", icon: Brain, href: "/ai-risk-management?tab=criteria", section: "ai-risk.criteria" },
          { id: "documentation-sources", labelKey: "layout.sidebar.items.documentationSources", icon: BookOpen, href: "/ai-risk-management?tab=docs", section: "ai-risk.docs" },
        ],
      },
    ],
  },
  {
    id: "help",
    labelKey: "layout.sidebar.groups.help",
    items: [
      { id: "getting-started", labelKey: "nav.gettingStarted", icon: BookOpen, href: "/getting-started", section: "getting_started", sources: ["getting-started"] },
      {
        id: "about",
        labelKey: "nav.about",
        icon: SquareTerminal,
        href: "/about",
        sources: ["about"],
        children: [
          { id: "introduction", labelKey: "layout.sidebar.items.introduction", icon: Binoculars, href: "/about?tab=introduction", section: "about.introduction" },
          { id: "clear2close", labelKey: "layout.sidebar.items.clear2close", icon: Atom, href: "/about?tab=clear2close", section: "about.clear2close" },
          { id: "documentation", labelKey: "layout.sidebar.items.documentation", icon: BookKey, href: "/about?tab=documentation", section: "about.documentation" },
        ],
      },
    ],
  },
  {
    // One Admin page (/admin?tab=…), categories like ImpactIQ's Admin menu.
    // Every entry lives on /admin, so moving between them never reloads the
    // page. Old /config, /communications, /archive-management and
    // /about?tab=support-features URLs redirect here (admin-redirects.ts).
    id: "admin",
    labelKey: "layout.sidebar.groups.admin",
    secondTier: true,
    items: [
      {
        id: "projects-rules",
        labelKey: "layout.sidebar.items.projectsRules",
        icon: ListChecks,
        href: "/admin?tab=configuration",
        children: [
          {
            id: "field-settings", labelKey: "layout.sidebar.items.fieldSettings", icon: Settings, href: "/admin?tab=configuration", section: "config.configuration",
            views: [
              { id: "field-settings-project-status", labelKey: "layout.sidebar.items.projectStatus", icon: Filter, href: "/admin?tab=configuration&subtab=project-status", section: "config.configuration" },
              { id: "field-settings-account-status", labelKey: "layout.sidebar.items.accountStatus", icon: UserCheck, href: "/admin?tab=configuration&subtab=account-status", section: "config.configuration" },
              { id: "field-settings-risk-level", labelKey: "layout.sidebar.items.riskLevel", icon: AlertTriangle, href: "/admin?tab=configuration&subtab=risk-level", section: "config.configuration" },
              { id: "field-settings-ranking", labelKey: "layout.sidebar.items.ranking", icon: TrendingUp, href: "/admin?tab=configuration&subtab=ranking", section: "config.configuration" },
              { id: "field-settings-tags", labelKey: "layout.sidebar.items.tags", icon: Tag, href: "/admin?tab=configuration&subtab=tags", section: "config.configuration" },
              { id: "field-settings-end-date-flags", labelKey: "layout.sidebar.items.endDateFlags", icon: CalendarRange, href: "/admin?tab=configuration&subtab=end-date-flags", section: "config.configuration" },
            ],
          },
          { id: "industries", labelKey: "layout.sidebar.items.industries", icon: Building, href: "/admin?tab=industries", section: "config.industries" },
          { id: "outcome-configuration", labelKey: "layout.sidebar.items.outcomeIntelligence", icon: BrainCircuit, href: "/admin?tab=outcome-configuration", section: "config.outcome-configuration" },
          {
            id: "workflow-automation", labelKey: "layout.sidebar.items.workflowAutomation", icon: SendToBack, href: "/admin?tab=workflow-automation", section: "config.workflow-automation",
            views: [
              { id: "workflow-automation-feed", labelKey: "layout.sidebar.items.automationFeed", icon: BarChart3, href: "/admin?tab=workflow-automation&subtab=automation-feed", section: "config.workflow-automation" },
              { id: "workflow-automation-rules", labelKey: "layout.sidebar.items.rules", icon: ListOrdered, href: "/admin?tab=workflow-automation&subtab=rules", section: "config.workflow-automation" },
              { id: "workflow-automation-origins", labelKey: "layout.sidebar.items.triggerOrigins", icon: Combine, href: "/admin?tab=workflow-automation&subtab=origins", section: "config.workflow-automation" },
              { id: "workflow-automation-diagnostics", labelKey: "layout.sidebar.items.diagnostics", icon: Bug, href: "/admin?tab=workflow-automation&subtab=diagnostics", section: "config.workflow-automation" },
              { id: "workflow-automation-map", labelKey: "layout.sidebar.items.mapAutomation", icon: FolderGit2, href: "/admin?tab=workflow-automation&subtab=map-automation", section: "config.workflow-automation" },
            ],
          },
        ],
      },
      {
        // Users, Role Management and Login Management were the three views of
        // User Management. Teams (organize and filter only) has its own page.
        id: "team-people",
        labelKey: "layout.sidebar.items.teamPeople",
        icon: UsersRound,
        href: "/admin?tab=users",
        children: [
          { id: "users", labelKey: "layout.sidebar.items.users", icon: Users, href: "/admin?tab=users", section: "config.user-management" },
          { id: "teams", labelKey: "layout.sidebar.items.teams", icon: UsersRound, href: "/admin?tab=teams", section: "config.teams" },
          { id: "roles", labelKey: "layout.sidebar.items.roleManagement", icon: UserCog, href: "/admin?tab=roles", section: "config.roles" },
          { id: "login-management", labelKey: "layout.sidebar.items.loginManagement", icon: ShieldCheck, href: "/admin?tab=login-management", section: "config.login-management" },
        ],
      },
      {
        id: "workplace",
        labelKey: "layout.sidebar.items.workplace",
        icon: Briefcase,
        href: "/admin?tab=fiscal-calendar",
        children: [
          { id: "fiscal-calendar", labelKey: "layout.sidebar.items.fiscalCalendar", icon: Calendar, href: "/admin?tab=fiscal-calendar", section: "config.fiscal-calendar" },
          { id: "terminology", labelKey: "layout.sidebar.items.terminology", icon: SpellCheck, href: "/admin?tab=terminology", adminOnly: true },
          { id: "system-announcements", labelKey: "layout.sidebar.items.announcements", icon: Megaphone, href: "/admin?tab=system-announcements", adminOnly: true },
          { id: "flight-deck", labelKey: "layout.sidebar.items.flightDeck", icon: TicketsPlane, href: "/admin?tab=flight-deck", adminOnly: true },
          { id: "email-templates", labelKey: "layout.sidebar.items.emailTemplates", icon: Mails, href: "/admin?tab=email-templates", section: "communications.email-templates" },
          { id: "email-designs", labelKey: "layout.sidebar.items.emailDesigns", icon: PencilRuler, href: "/admin?tab=email-designs", section: "communications.email-designs" },
          { id: "support-requests", guideTopic: "help", labelKey: "layout.sidebar.items.supportRequests", icon: PocketKnife, href: "/admin?tab=support-requests", section: "about.support-features" },
        ],
      },
      {
        id: "integrations",
        labelKey: "layout.sidebar.items.integrations",
        icon: Plug,
        href: "/admin?tab=salesforce-configuration",
        children: [
          { id: "integrations-overview", labelKey: "layout.sidebar.items.overview", icon: LayoutGrid, href: "/admin?tab=salesforce-configuration&subtab=overview", section: "config.salesforce-configuration" },
          {
            id: "integrations-salesforce", labelKey: "layout.sidebar.items.salesforce", icon: Cloud, href: "/admin?tab=salesforce-configuration&subtab=salesforce", section: "config.salesforce", crm: "salesforce",
            views: [
              { id: "salesforce-credentials", labelKey: "layout.sidebar.items.credentials", icon: Key, href: "/admin?tab=salesforce-configuration&subtab=salesforce&sfsubtab=credentials", section: "config.salesforce" },
              { id: "salesforce-field-mappings", labelKey: "layout.sidebar.items.fieldMappings", icon: ArrowLeftRight, href: "/admin?tab=salesforce-configuration&subtab=salesforce&sfsubtab=field-mappings", section: "config.salesforce" },
              { id: "salesforce-sync-policies", labelKey: "layout.sidebar.items.syncPolicies", icon: Settings2, href: "/admin?tab=salesforce-configuration&subtab=salesforce&sfsubtab=sync-policies", section: "config.salesforce" },
              { id: "salesforce-sync-history", labelKey: "layout.sidebar.items.syncHistory", icon: History, href: "/admin?tab=salesforce-configuration&subtab=salesforce&sfsubtab=sync-history", section: "config.salesforce" },
            ],
          },
          {
            id: "integrations-hubspot", labelKey: "layout.sidebar.items.hubspot", icon: Orbit, href: "/admin?tab=salesforce-configuration&subtab=hubspot", section: "config.hubspot", crm: "hubspot",
            views: [
              { id: "hubspot-field-mappings", labelKey: "layout.sidebar.items.fieldMappings", icon: ArrowLeftRight, href: "/admin?tab=salesforce-configuration&subtab=hubspot&sfsubtab=field-mappings", section: "config.hubspot" },
              { id: "hubspot-sync-policies", labelKey: "layout.sidebar.items.syncPolicies", icon: Settings2, href: "/admin?tab=salesforce-configuration&subtab=hubspot&sfsubtab=sync-policies", section: "config.hubspot" },
              { id: "hubspot-sync-history", labelKey: "layout.sidebar.items.syncHistory", icon: History, href: "/admin?tab=salesforce-configuration&subtab=hubspot&sfsubtab=sync-history", section: "config.hubspot" },
            ],
          },
          { id: "integrations-ai-providers", labelKey: "layout.sidebar.items.aiProviders", icon: Brain, href: "/admin?tab=salesforce-configuration&subtab=ai-providers", section: "config.ai-providers" },
          { id: "webhooks", labelKey: "layout.sidebar.items.webhooks", icon: Webhook, href: "/admin?tab=webhooks", adminOnly: true },
          { id: "integrations-n8n", labelKey: "layout.sidebar.items.n8n", icon: Zap, href: "/admin?tab=salesforce-configuration&subtab=n8n", section: "config.n8n" },
          { id: "integrations-mcp-server", labelKey: "layout.sidebar.items.mcpServer", icon: Server, href: "/admin?tab=salesforce-configuration&subtab=mcp-server", section: "config.mcp-server" },
          {
            // No TAB_DEFAULT_PARAMS entry: without a subtab the page opens on
            // the saved provider and writes it into the URL.
            id: "storage-providers", labelKey: "layout.sidebar.items.storageProviders", icon: Cloud, href: "/admin?tab=storage-providers", adminOnly: true,
            views: [
              { id: "storage-providers-gcs", labelKey: "layout.sidebar.items.storageGcs", icon: Cloud, href: "/admin?tab=storage-providers&subtab=gcs", adminOnly: true },
              { id: "storage-providers-aws", labelKey: "layout.sidebar.items.storageAws", icon: Cloud, href: "/admin?tab=storage-providers&subtab=aws", adminOnly: true },
              { id: "storage-providers-azure", labelKey: "layout.sidebar.items.storageAzure", icon: Cloud, href: "/admin?tab=storage-providers&subtab=azure", adminOnly: true },
              { id: "storage-providers-db", labelKey: "layout.sidebar.items.database", icon: Database, href: "/admin?tab=storage-providers&subtab=db", adminOnly: true },
              { id: "storage-providers-local", labelKey: "layout.sidebar.items.storageLocal", icon: HardDrive, href: "/admin?tab=storage-providers&subtab=local", adminOnly: true },
            ],
          },
        ],
      },
      {
        // Admin-only, not delegable through Role Management (like VectorIQ's
        // Theming): it changes how the app looks for everyone.
        id: "appearance",
        labelKey: "layout.sidebar.items.appearance",
        icon: Palette,
        href: "/admin?tab=appearance",
        section: "config.appearance",
        adminOnly: true,
        children: [
          { id: "appearance-theming", labelKey: "layout.sidebar.items.theming", icon: SwatchBook, href: "/admin?tab=appearance&subtab=theming", section: "config.appearance", adminOnly: true },
          { id: "appearance-media", labelKey: "layout.sidebar.items.media", icon: Images, href: "/admin?tab=appearance&subtab=media", section: "config.appearance", adminOnly: true },
        ],
      },
      {
        // No item-level section: the category shows when any child does
        // (Login History keeps the User Management permission).
        id: "monitoring",
        labelKey: "layout.sidebar.items.monitoringAudit",
        icon: HeartPulse,
        href: "/admin?tab=system-health",
        children: [
          {
            id: "app-health", labelKey: "layout.sidebar.items.appHealth", icon: HeartPulse, href: "/admin?tab=system-health", section: "config.system-health",
            views: [
              { id: "system-health-overview", labelKey: "layout.sidebar.items.overview", icon: HeartPulse, href: "/admin?tab=system-health&subtab=overview", section: "config.system-health" },
              { id: "system-health-database", labelKey: "layout.sidebar.items.database", icon: Database, href: "/admin?tab=system-health&subtab=database", section: "config.system-health" },
              { id: "system-health-email", labelKey: "layout.sidebar.items.email", icon: Mail, href: "/admin?tab=system-health&subtab=email", section: "config.system-health" },
              { id: "system-health-integrations", labelKey: "layout.sidebar.items.integrations", icon: Plug, href: "/admin?tab=system-health&subtab=integrations", section: "config.system-health" },
              { id: "system-health-security", labelKey: "layout.sidebar.items.security", icon: Shield, href: "/admin?tab=system-health&subtab=security", section: "config.system-health" },
              { id: "system-health-services", labelKey: "layout.sidebar.items.services", icon: Cog, href: "/admin?tab=system-health&subtab=services", section: "config.system-health" },
              { id: "system-health-storage", labelKey: "layout.sidebar.items.storage", icon: HardDrive, href: "/admin?tab=system-health&subtab=storage", section: "config.system-health" },
              { id: "system-health-performance", labelKey: "layout.sidebar.items.performance", icon: Gauge, href: "/admin?tab=system-health&subtab=performance", section: "config.system-health" },
              { id: "system-health-archive", labelKey: "layout.sidebar.items.archive", icon: Archive, href: "/admin?tab=system-health&subtab=archive", section: "config.system-health" },
            ],
          },
          { id: "login-history", labelKey: "layout.sidebar.items.loginHistory", icon: LogIn, href: "/admin?tab=login-history", section: "config.login-history" },
          { id: "email-logs", labelKey: "layout.sidebar.items.emailLogs", icon: Mail, href: "/admin?tab=email-logs", section: "communications.email-logs" },
          { id: "error-log", labelKey: "layout.sidebar.items.errorLog", icon: Bug, href: "/admin?tab=error-log", section: "about.support-features", adminOnly: true },
          { id: "page-usage", labelKey: "layout.sidebar.items.pageUsage", icon: ChartColumnStacked, href: "/admin?tab=page-usage", section: "config.system-health", adminOnly: true },
          { id: "scheduler", labelKey: "layout.sidebar.items.scheduler", icon: CalendarClock, href: "/admin?tab=scheduler", section: "config.scheduler" },
          { id: "database-connection", labelKey: "layout.sidebar.items.databaseConnection", icon: DatabaseZap, href: "/admin?tab=database-connection", section: "config.database-connection" },
          { id: "backup", labelKey: "layout.sidebar.items.backupRestore", icon: ArchiveRestore, href: "/admin?tab=backup", section: "config.system-health", adminOnly: true },
          {
            id: "archives", labelKey: "layout.sidebar.items.archives", icon: Archive, href: "/admin?tab=archive", section: "config.archives",
            views: [
              { id: "archives-log", labelKey: "layout.sidebar.items.activityLog", icon: Calendar, href: "/admin?tab=archive&subtab=log", section: "config.archives" },
              { id: "archives-users", labelKey: "layout.sidebar.items.users", icon: User, href: "/admin?tab=archive&subtab=users", section: "config.archives" },
              { id: "archives-projects", labelKey: "layout.sidebar.items.projects", icon: FolderOpen, href: "/admin?tab=archive&subtab=projects", section: "config.archives" },
              { id: "archives-customers", labelKey: "layout.sidebar.items.customers", icon: Building, href: "/admin?tab=archive&subtab=customers", section: "config.archives" },
            ],
          },
        ],
      },
      {
        id: "demo",
        labelKey: "layout.sidebar.items.demo",
        icon: MonitorPlay,
        href: "/admin?tab=demo-mode",
        section: "config.demo-mode",
        children: [
          { id: "demo-mode", labelKey: "layout.sidebar.items.demoMode", icon: MonitorPlay, href: "/admin?tab=demo-mode", section: "config.demo-mode" },
        ],
      },
    ],
  },
];

// ─── pure helpers (unit-tested in __tests__/sidebar-nav-config.test.ts) ─────

function splitHref(href: string): { path: string; params: URLSearchParams } {
  const [path, query = ""] = href.split("?");
  return { path, params: new URLSearchParams(query) };
}

function defaultParamsFor(path: string, current: URLSearchParams): Record<string, string> {
  const routeDefaults = ROUTE_DEFAULT_PARAMS[path] ?? {};
  const tab = current.get("tab");
  const tabDefaults = !tab || tab === routeDefaults.tab ? routeDefaults : TAB_DEFAULT_PARAMS[`${path}?tab=${tab}`] ?? {};
  const subtab = current.get("subtab") ?? tabDefaults.subtab;
  const subtabDefaults = subtab ? TAB_DEFAULT_PARAMS[`${path}?tab=${tab ?? routeDefaults.tab}&subtab=${subtab}`] : undefined;
  return subtabDefaults ? { ...tabDefaults, ...subtabDefaults } : tabDefaults;
}

/**
 * True when `href` matches the current location: same pathname, and every
 * query parameter in `href` equals the current value (after filling in the
 * page's default tab/subtab). Extra current parameters (deeper in-page tabs)
 * are ignored, so `/admin?tab=system-health` stays active on any System
 * Health sub-tab.
 */
export function isLinkActive(href: string, pathname: string, search: string, extraPaths: string[] = []): boolean {
  const { path, params } = splitHref(href);
  if (pathname !== path && !extraPaths.includes(pathname)) return false;
  if (pathname !== path) return true; // matched via extraPaths
  const current = new URLSearchParams(search);
  const defaults = defaultParamsFor(path, current);
  for (const [key, value] of params.entries()) {
    const actual = current.get(key) ?? defaults[key];
    if (actual !== value) return false;
  }
  return true;
}

function sourceFor(pathname: string, search: string): { onProjectPage: boolean; source: string | null } {
  const onProjectPage = pathname.startsWith("/project/") || pathname.startsWith("/edit-project/");
  return { onProjectPage, source: onProjectPage ? new URLSearchParams(search).get("source") : null };
}

/** Active child of an item, if any. */
export function activeChildId(item: SidebarNavItem, pathname: string, search: string): string | undefined {
  return item.children?.find((c) => isLinkActive(c.href, pathname, search))?.id;
}

/**
 * The item whose children include the current page. Its children are the
 * page's top tab bar, so the tab bar always mirrors the sidebar. Undefined on
 * pages that are a single sidebar entry (Dashboard, Create Project, …).
 */
export function activeSection(groups: SidebarNavGroup[], pathname: string, search: string): SidebarNavItem | undefined {
  for (const group of groups) {
    for (const item of group.items) {
      if (item.children?.length && activeChildId(item, pathname, search)) return item;
    }
  }
  return undefined;
}

/** Active view of a page link (Admin pages with `views`), if any. */
export function activeViewId(link: SidebarNavLink, pathname: string, search: string): string | undefined {
  return link.views?.find((v) => isLinkActive(v.href, pathname, search))?.id;
}

/** True when any item of the group matches the current location. */
export function isGroupActive(group: SidebarNavGroup, pathname: string, search: string): boolean {
  return group.items.some((item) => isItemActive(item, pathname, search));
}

/** True when the item (or one of its children) matches the current location. */
export function isItemActive(item: SidebarNavItem, pathname: string, search: string): boolean {
  const { onProjectPage, source } = sourceFor(pathname, search);
  if (onProjectPage) {
    return !!item.sources && item.sources.includes(source);
  }
  if (item.children?.length) {
    if (activeChildId(item, pathname, search)) return true;
    // Item-level extra paths, for parents whose page lives at another URL.
    return !!item.extraPaths?.includes(pathname);
  }
  return isLinkActive(item.href, pathname, search, item.extraPaths);
}

/**
 * Applies permissions: drops children the viewer can't see, drops items with
 * no visible entry, and drops empty groups. An item with its own `section` is
 * shown only if that section is viewable; an item without one (Accounts,
 * Knowledge) is shown when at least one child is. With `activeCrm`, a CRM's
 * own settings pages are dropped unless it is the install's CRM; omit it to
 * keep every CRM's pages.
 */
export function filterSidebarNav(
  groups: SidebarNavGroup[],
  canView: (section: string) => boolean,
  isAdmin: boolean,
  activeCrm?: CrmProviderId,
): SidebarNavGroup[] {
  const linkVisible = (l: SidebarNavLink) =>
    (!l.adminOnly || isAdmin) && (!l.section || canView(l.section)) && (!l.crm || !activeCrm || l.crm === activeCrm);
  return groups
    .map((g) => ({
      ...g,
      items: g.items
        .map((item) => ({
          ...item,
          children: item.children?.filter(linkVisible).map((c) => (c.views ? { ...c, views: c.views.filter(linkVisible) } : c)),
        }))
        .filter((item) => {
          if (item.section) return linkVisible(item);
          return (item.children?.length ?? 0) > 0 || (!item.children && linkVisible(item));
        }),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * Guide topic for the page at this location, for the header's ? button: the
 * active menu entry's topic, else its parent item's, else Workspace. Edit
 * project pages open Project information.
 */
export function guideTopicForLocation(pathname: string, search: string): GuideTopicKey {
  if (pathname.startsWith("/edit-project/")) return "projectInfo";
  for (const group of SIDEBAR_NAV) {
    for (const item of group.items) {
      if (!isItemActive(item, pathname, search)) continue;
      const child = item.children?.find((c) => isLinkActive(c.href, pathname, search));
      return child?.guideTopic ?? item.guideTopic ?? "workspace";
    }
  }
  return "workspace";
}
