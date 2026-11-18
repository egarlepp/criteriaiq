import { useState, useEffect, useMemo } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { usePermissions } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";
import { 
  SortableTable, 
  SortableTableHeader, 
  SortableTableHead, 
  SortableTableBody, 
  SortableTableRow, 
  SortableTableCell 
} from "@/components/ui/sortable-table";
import { useSortState, makeComparator, stableSort } from "@/lib/sorting";
import { SupportFeatureButton } from "@/components/support/support-feature-button";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, HelpCircle, Settings, Workflow, Rocket, Code, BarChart3, Bug, ShieldUser, Download, ExternalLink, Calendar, Users, Building, User, Lightbulb, PocketKnife, Clock, TrendingUp, Activity, Wifi, HardDrive, Globe, X, Target, Plus, Folder, CheckCircle2, BookOpen, CheckCircleIcon, Atom, BookKey, Home, CheckCircle, FolderOpen, Brain, Binoculars, Goal, ScanSearch, Search, Eye, AlertTriangle, XCircle, Loader2, Edit, Trash2, Sparkles, CalendarSync, Ghost, BookText, MessageSquarePlus, Copy, Upload, Info, RefreshCw, Mail, Waypoints, Webhook, Cloud, Megaphone, PlaneTakeoff, AlignVerticalSpaceAround, Map, Archive, Zap, Terminal, GitBranch, Monitor } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from "date-fns";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { IntroductionTab } from "@/components/about/IntroductionTab";
import { Clear2CloseTab } from "@/components/about/Clear2CloseTab";
import { DocumentationTab } from "@/components/about/DocumentationTab";
import type { SupportRequest, Filters } from "@/components/about/types";
import { getApplicationPageDisplayName, getPriorityBadge, getStatusBadge, getStatusIcon } from "@/components/about/types";

export default function AboutPage() {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation(); // Added for translations
  
  // Tab state - Read from URL parameters
  const getInitialTab = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    // Removed tabs (language-translation, ui-ux-library, ui-showcase,
    // toast-showcase) fall through to Introduction.
    return tabParam && ['introduction', 'clear2close', 'documentation'].includes(tabParam) 
      ? tabParam 
      : 'introduction';
  };
  
  // `?doc=<id>` deep-link target (e.g. a global-search result for a
  // specific document). Passed to DocumentationTab as `initialDocId`
  // so the doc opens instead of just landing on the Documentation tab.
  const getDocParam = () =>
    new URLSearchParams(window.location.search).get('doc') || undefined;

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [docParam, setDocParam] = useState<string | undefined>(getDocParam);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string>("");
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const { user } = useAuth();
  
  // Check if user has access to documentation (not Customer, Partner, or Guest)
  const hasDocumentationAccess = user?.role && !['customer', 'partner', 'guest'].includes(user.role.toLowerCase());

  // Documentation items organized by category
  const documentationCategories = [
    {
      name: "Project & Architecture",
      icon: Building,
      color: "blue",
      items: [
        {
          id: "project_overview",
          name: "Project Overview",
          icon: HelpCircle,
          description: "High-level project summary, goals, stakeholders, and current status with key milestones.",
          endpoint: "/api/docs/project_overview",
        },
        {
          id: "design_document",
          name: "Design Document",
          icon: Settings,
          description: "Comprehensive design specifications including technical architecture, data models, and user experience standards.",
          endpoint: "/api/docs/design_document",
        },
        {
          id: "technical-architecture",
          name: "Technical Architecture",
          icon: Code,
          description: "Detailed technical implementation guide, system architecture, and development guidelines.",
          endpoint: "/api/docs/technical-architecture",
        },
        {
          id: "workflow_diagram",
          name: "Workflow Diagrams",
          icon: Workflow,
          description: "Visual workflow diagrams showing system processes, user flows, authentication, and project management.",
          endpoint: "/api/docs/workflow_diagram",
        },
        {
          id: "map_system_architecture",
          name: "MAP System Architecture",
          icon: Waypoints,
          description: "Comprehensive documentation for the Mutual Action Plan (MAP) system including 11-table architecture, assignment framework, automation, real-time collaboration, and best practices for administrators.",
          endpoint: "/api/docs/map-system-architecture",
        },
        {
          id: "gap_analysis_system",
          name: "Gap Analysis System",
          icon: AlignVerticalSpaceAround,
          description: "Complete documentation for the Gap Analysis system including architecture, component locations, API endpoints, integration points, and best practices for tracking solution limitations.",
          endpoint: "/api/docs/gap-analysis-system",
        },
        {
          id: "outcome_intelligence_system",
          name: "Outcome Intelligence System",
          icon: Brain,
          description: "Comprehensive documentation for the Project Closure Outcome & Intelligence System (PCOS) including scoring methodology, Moneyball metrics, configurable capture logic, dashboard analytics, and best practices for technical intelligence gathering.",
          endpoint: "/api/docs/outcome-intelligence-system",
        },
        {
          id: "ai_assessment_system",
          name: "AI Assessment System",
          icon: Binoculars,
          description: "Comprehensive documentation for the multi-ruleset AI Assessment system including database schema, data source registry (60+ fields), AI engine prompt construction, per-criterion data source targeting, custom instructions, output format templates, API endpoints, frontend components, and extensibility guide.",
          endpoint: "/api/docs/ai-assessment-system",
        },
        {
          id: "report_builder",
          name: "Report Builder",
          icon: BarChart3,
          description: "Custom report authoring: the server-driven field registry, color-coded source groups, the dynamic JOIN executor, per-source filter examples, and the recipe for adding a new reportable source.",
          endpoint: "/api/docs/report-builder",
        },
        {
          id: "navigation_sitemap",
          name: "Navigation Sitemap",
          icon: Map,
          description: "Complete navigation hierarchy documentation showing all routes, query parameters, tabs, and sub-tabs for the 3-tier navigation architecture.",
          endpoint: "/api/docs/navigation-sitemap",
        },
        {
          id: "application_startup_routing",
          name: "Application Startup & Routing",
          icon: Rocket,
          description: "Full documentation of the application startup sequence — provider hierarchy, authentication decision tree, all route definitions, default landing page logic, and how to change the default page.",
          endpoint: "/api/docs/application-startup-routing",
        },
        {
          id: "backlog",
          name: "Backlog",
          icon: Lightbulb,
          description: "Ideas and deferred follow-ups that are not scheduled yet, grouped by area, with links to the active sweep plans.",
          endpoint: "/api/docs/backlog",
        }
      ]
    },
    {
      name: "Development & Components",
      icon: Code,
      color: "green",
      items: [
        {
          id: "first_run_setup",
          name: "First-Run Setup & Bootstrap",
          icon: Rocket,
          description: "How the 7-step setup wizard takes a fresh database to a logged-in admin, including secret resolution, env-var bootstrap, and health checks.",
          endpoint: "/api/docs/first-run-setup",
        },
        {
          id: "sorting_docs",
          name: "Sorting System",
          icon: BarChart3,
          description: "Comprehensive documentation for the reusable sorting system including utilities, components, and usage examples.",
          endpoint: "/api/docs/sorting_docs",
        },
        {
          id: "tiptap_editor_system",
          name: "Tiptap Editor System",
          icon: Edit,
          description: "Complete guide to the reusable Tiptap rich-text/markdown editor component system including configuration, usage patterns, toolbar variants, and the custom Admonition node.",
          endpoint: "/api/docs/tiptap-editor-system",
        },
        {
          id: "icon_picker_system",
          name: "Icon Picker System",
          icon: Sparkles,
          description: "Comprehensive guide to the reusable Icon Picker component including usage and modal/drawer integration patterns.",
          endpoint: "/api/docs/icon-picker-system",
        },
        {
          id: "color_picker_system",
          name: "ColorPicker System",
          icon: Sparkles,
          description: "Comprehensive guide to the ColorPicker component with preset swatches, HexColorPicker, dark mode support, and size variants.",
          endpoint: "/api/docs/color-picker-system",
        },
        {
          id: "toast_notification_system",
          name: "Toast Notification System",
          icon: MessageSquarePlus,
          description: "Comprehensive documentation for the standardized toast notification system with 6 variants, 4 categories, i18n support, and smart auto-dismiss.",
          endpoint: "/api/docs/toast-notification-system",
        },
        {
          id: "language_translation",
          name: "Language Translation",
          icon: Globe,
          description: "Comprehensive guide for managing internationalization, adding new languages, and translation workflows.",
          endpoint: "/api/docs/language_translation",
        },
        {
          id: "adding_a_new_language",
          name: "Adding a New Language",
          icon: Globe,
          description: "Step-by-step guide for adding a new locale to CriteriaIQ: the 4-edit operation, translation file structure, and hand-off to translators.",
          endpoint: "/api/docs/adding-a-new-language",
        },
        {
          id: "workflow_automation_triggers",
          name: "Workflow Automation Triggers",
          icon: Mail,
          description: "Complete documentation for the automatic trigger registration system with 65+ system-defined triggers, architecture, and developer guide.",
          endpoint: "/api/docs/workflow-automation-triggers",
        },
        {
          id: "workflow_automation_system",
          name: "Workflow Automation System",
          icon: Workflow,
          description: "Comprehensive documentation for the workflow automation system including rules engine, email sending, webhook triggering, Salesforce updates, user preferences, test mode, schedules, and diagnostics.",
          endpoint: "/api/docs/workflow-automation-system",
        },
        {
          id: "api_reference",
          name: "API Reference",
          icon: Code,
          description: "Complete REST API reference with all 357 endpoints, authentication, parameters, response formats, and best practices for developers.",
          endpoint: "/api/docs/api-reference",
        },
        {
          id: "workflow_triggers_reference",
          name: "Workflow Triggers Reference",
          icon: Mail,
          description: "Comprehensive reference of all 65+ workflow automation triggers including metadata schemas, categories, types, and implementation guide.",
          endpoint: "/api/docs/email-triggers-reference",
        },
        {
          id: "webhook_reference",
          name: "Webhook Reference",
          icon: Webhook,
          description: "Complete guide to the webhook system for Microsoft Teams, Slack, and generic HTTP integrations with Handlebars templates and HMAC signing.",
          endpoint: "/api/docs/webhook-reference",
        },
        {
          id: "global_search_system",
          name: "Global Search System",
          icon: ScanSearch,
          description: "Comprehensive documentation for the role-aware command palette search system including keyboard shortcuts, ranking algorithm, API, and accessibility features.",
          endpoint: "/api/docs/global-search-system",
        },
        {
          id: "system_announcements",
          name: "System Announcements Engine",
          icon: Megaphone,
          description: "Comprehensive documentation for the System Announcements Engine including header bell icon, bottom banner, role-based targeting, severity levels, read tracking, and admin management.",
          endpoint: "/api/docs/system-announcements",
        },
        {
          id: "flight_deck",
          name: "Flight Deck Engine",
          icon: PlaneTakeoff,
          description: "Comprehensive documentation for the Flight Deck role-based welcome modal system including widgets, display scenarios, tips, admin configuration, preview functionality, and architecture.",
          endpoint: "/api/docs/flight-deck",
        },
        {
          id: "modern_card_styling_system",
          name: "Modern Card Styling System",
          icon: BarChart3,
          description: "Technical documentation for the composable card framework including DemoStatCard, RailConfig, AccentIconConfig, theming system, and variant registry for dashboards and KPI tiles.",
          endpoint: "/api/docs/modern-card-styling-system",
        },
        {
          id: "demo_mode",
          name: "Demo Mode",
          icon: Monitor,
          description: "Operator reference for the Demo Mode admin feature: synthetic data isolation, the three resolution sources, admin-only configuration, and audit logging.",
          endpoint: "/api/docs/demo-mode",
        },
        {
          id: "standard_table_pattern",
          name: "Standard Table Pattern",
          icon: AlignVerticalSpaceAround,
          description: "The reusable sortable / filterable / paginated table: SortableTableHead per-column filters, URL-persisted filter state via useUrlFilterState, and the wiring recipe for new tables.",
          endpoint: "/api/docs/standard-table-pattern",
        },
        {
          id: "storage_mixin_architecture",
          name: "Storage Mixin Architecture",
          icon: HardDrive,
          description: "How the DatabaseStorage data-access layer is composed from 29 domain mixins, why it was split, and exactly where to put a new storage method.",
          endpoint: "/api/docs/storage-mixin-architecture",
        }
      ]
    },
    {
      name: "Integrations",
      icon: Cloud,
      color: "cyan",
      items: [
        {
          id: "salesforce_system",
          name: "Salesforce Field Mapping",
          icon: Cloud,
          description: "Complete documentation for the Salesforce integration including bidirectional sync, field mappings, value translation, conflict resolution, and record linkage.",
          endpoint: "/api/docs/salesforce-system",
        },
        {
          id: "n8n_integration",
          name: "n8n Integration",
          icon: Zap,
          description: "Bidirectional n8n integration guide covering Bearer token API key auth, inbound trigger bridge, outbound webhooks, connection config, scope reference, and n8n workflow examples.",
          endpoint: "/api/docs/n8n-integration",
        },
        {
          id: "ai_provider_webhook",
          name: "Webhook AI Provider — proxy completions through n8n",
          icon: Zap,
          description: "Route AI assessment completions through n8n (or any HTTP endpoint) to dispatch to Azure AI Foundry, Bedrock, or an internal LLM gateway: the request/response contract, security modes, sample n8n workflow JSON, and the discovery dropdown sourced from the n8n integration.",
          endpoint: "/api/docs/ai-provider-webhook",
        }
      ]
    },
    {
      name: "Security & Authentication",
      icon: ShieldUser,
      color: "purple",
      items: [
        {
          id: "mfa_system_documentation",
          name: "Multi-Factor Authentication (MFA)",
          icon: ShieldUser,
          description: "Comprehensive documentation for the MFA system including TOTP, WebAuthn passkeys, recovery codes, and security health.",
          endpoint: "/api/docs/mfa_system_documentation",
        },
        {
          id: "single_sign_on",
          name: "Single Sign-On (Okta SSO and Azure SSO)",
          icon: ShieldUser,
          description: "Okta and Microsoft Entra ID (Azure) single sign-on for internal users. Covers the OIDC flow, group → role mapping, JIT provisioning, MFA stacking, identity-source surfacing, and the break-glass path when Okta is unreachable.",
          endpoint: "/api/docs/single-sign-on",
        },
        {
          id: "okta_setup_guide",
          name: "Okta SSO Setup Guide",
          icon: ShieldUser,
          description: "Step-by-step Okta admin console walkthrough: create the OIDC application, assign users / groups, expose the groups claim, configure CriteriaIQ, and verify with an end-to-end sign-in.",
          endpoint: "/api/docs/okta-setup",
        },
        {
          id: "azure_sso_setup_guide",
          name: "Azure SSO Setup Guide",
          icon: ShieldUser,
          description: "Microsoft Entra ID walkthrough: register a single-tenant app, create the client secret, add the email and groups claims, configure CriteriaIQ, and troubleshoot common sign-in errors.",
          endpoint: "/api/docs/azure-sso-setup",
        },
        {
          id: "mcp_server",
          name: "MCP Server",
          icon: ShieldUser,
          description: "Read-only Model Context Protocol server for AI clients: the five tools, mcp:read keys, the on/off switch, rate limits, the activity log, and client setup.",
          endpoint: "/api/docs/mcp-server",
        },
        {
          id: "account_user_management",
          name: "Account & User Management",
          icon: Users,
          description: "Complete guide for account and user lifecycle management including email domain restrictions, approval workflow, required fields, and role permissions.",
          endpoint: "/api/docs/account-user-management",
        },
        {
          id: "file_upload_system",
          name: "File Upload System",
          icon: Upload,
          description: "Architecture for the centralized secure file upload pipeline covering quarantine staging, ClamAV virus scanning, magic-byte validation, GCS storage with local fallback, path conventions, and per-context size limits.",
          endpoint: "/api/docs/file-upload-system",
        },
        {
          id: "approved_email_domains",
          name: "Approved Email Domains",
          icon: Mail,
          description: "How self-registration is gated by email domain: account-scoped and global allowed domains, auto-approve behavior, and per-access-code domain narrowing.",
          endpoint: "/api/docs/approved-email-domains",
        },
        {
          id: "secrets_management",
          name: "Secrets Management",
          icon: BookKey,
          description: "Lifecycle of SESSION_SECRET and ENCRYPTION_KEY — host-env vs app-managed storage, reveal/promote/unmanage/regenerate operations, and production hardening. (Rotation mechanics live in the Encryption Key Rotation doc.)",
          endpoint: "/api/docs/secrets-management",
        },
        {
          id: "encryption_key_rotation",
          name: "Encryption Key Rotation",
          icon: BookKey,
          description: "How CriteriaIQ rotates ENCRYPTION_KEY and SESSION_SECRET safely — AES-256-GCM primitives, the encrypted-column manifest, transactional re-encryption, the dual-key decrypt fallback, forced logout, the rotation banner, and app-managed vs host-env secrets.",
          endpoint: "/api/docs/encryption-key-rotation",
        },
        {
          id: "email_graph_sending",
          name: "Email Sending — SMTP & Microsoft Graph",
          icon: Mail,
          description: "Outbound email transports: SMTP basic auth and the secure Microsoft Graph sendMail option (app-only OAuth, client secret or certificate, Application Access Policy, encrypted-at-rest credentials).",
          endpoint: "/api/docs/email-graph-sending",
        },
        {
          id: "entra_app_registration",
          name: "Entra App Registration Runbook (Graph Email)",
          icon: BookKey,
          description: "Step-by-step operator runbook to create the Microsoft Entra app registration for Graph email: Mail.Send permission, admin consent, client secret or certificate, Application Access Policy, and troubleshooting.",
          endpoint: "/api/docs/entra-app-registration",
        }
      ]
    },
    {
      name: "Database & Operations",
      icon: HardDrive,
      color: "orange",
      items: [
        {
          id: "backup_restore",
          name: "Backup & Restore",
          icon: HardDrive,
          description: "Download the whole database as one file and restore an install from it, with a preview and safety checks before anything is replaced.",
          endpoint: "/api/docs/backup-restore",
        },
        {
          id: "csv_import_guide",
          name: "CSV Import Guide",
          icon: Upload,
          description: "Comprehensive guide for bulk importing Solutions, Success Criteria, Expected Outcomes, and Actions via CSV with multi-solution assignment and edge case handling.",
          endpoint: "/api/docs/csv-import-guide",
        },
        {
          id: "archive_management_system",
          name: "Archive Management System",
          icon: Archive,
          description: "Complete documentation for the soft-delete archive system including archive/restore workflows, activity logging, schema validation, and API reference.",
          endpoint: "/api/docs/archive-management-system",
        },
        {
          id: "db_schema_refactor",
          name: "Database Schema Refactor",
          icon: HardDrive,
          description: "Full database audit and refactor guide covering UUID primary key migration for 80+ tables, data integrity constraints, B-Tree and GIN indexing strategy, query refactoring, and risks/trade-offs analysis.",
          endpoint: "/api/docs/db-schema-refactor",
        },
        {
          id: "database_connection_manager",
          name: "Database Connection Manager",
          icon: Wifi,
          description: "User guide for managing database connections: adding, testing, and activating connections. Covers the first-boot setup wizard, restart flow, and all UI dialogs.",
          endpoint: "/api/docs/database-connection-manager",
        },
        {
          id: "database_connection_architecture",
          name: "Database Connection Architecture",
          icon: FolderOpen,
          description: "Architecture reference for the two-layer database config system: file-based bootstrap config, environment variable fallback, startup sequence, encryption model, and restart mechanism.",
          endpoint: "/api/docs/database-connection-architecture",
        },
        {
          id: "migration_strategy",
          name: "Migration Strategy",
          icon: GitBranch,
          description: "Claude Code workflow onboarding guide — the CLAUDE.md prompt, coding-standard guardrails, and adoption strategy. (For database/schema promotion, see the Database Sync Runbook.)",
          endpoint: "/api/docs/migration-strategy",
        },
        {
          id: "system_health_dashboard",
          name: "System Health Dashboard",
          icon: Activity,
          description: "The 11-card System Health Overview: the three-status model, what each card checks, the server-derived headline rollup, the API surface, and the recipe for adding a new health check.",
          endpoint: "/api/docs/system-health-dashboard",
        }
      ]
    },
    {
      name: "Performance & Optimization",
      icon: TrendingUp,
      color: "red",
      items: [
        {
          id: "performance_monitoring",
          name: "Performance Monitoring",
          icon: Activity,
          description: "Guide on monitoring application performance, identifying bottlenecks, and optimizing resource utilization.",
          endpoint: "/api/docs/performance-monitoring-guide",
        },
        {
          id: "websocket_stability",
          name: "WebSocket Stability",
          icon: Wifi,
          description: "Best practices and troubleshooting for ensuring stable and reliable WebSocket connections.",
          endpoint: "/api/docs/websocket-stability-guide",
        },
        {
          id: "memory_management",
          name: "Memory Management",
          icon: HardDrive,
          description: "Guidelines for efficient memory management, preventing leaks, and optimizing memory usage in the application.",
          endpoint: "/api/docs/memory-management-guide",
        },
        {
          id: "error_handling_debug",
          name: "Error Handling & Debug",
          icon: Bug,
          description: "Comprehensive guide for debugging and error handling throughout the application with troubleshooting steps.",
          endpoint: "/api/docs/error_handling_debug",
        },
        {
          id: "metric_history_system",
          name: "Metric History System",
          icon: BarChart3,
          description: "Architecture for centralized metric tracking with weekly snapshots, sparkline trends, and week-over-week analysis.",
          endpoint: "/api/docs/metric-history-system",
        }
      ]
    },
    {
      name: "Deployment",
      icon: Rocket,
      color: "indigo",
      items: [
        {
          id: "deployment",
          name: "Deployment Guide",
          icon: Rocket,
          description: "Deployment instructions, versioning system, environment setup, and best practices.",
          endpoint: "/api/docs/deployment",
        },
        {
          id: "self_hosting",
          name: "Self-Hosting Guide",
          icon: Rocket,
          description: "Walkthroughs for self-hosting CriteriaIQ via docker compose, Hostinger VPS, or Dokploy.",
          endpoint: "/api/docs/self-hosting",
        },
        {
          id: "version_update_guide",
          name: "Version Update Guide",
          icon: TrendingUp,
          description: "Complete guide for updating application versions including files, logic, checklists, and content format guidelines.",
          endpoint: "/api/docs/version-update-guide",
        },
        {
          id: "local_dev_setup",
          name: "Local Development Setup",
          icon: Terminal,
          description: "Step-by-step guide for setting up CriteriaIQ locally on Windows including Docker Postgres, .env configuration, and launch commands.",
          endpoint: "/api/docs/local-dev-setup",
        },
        {
          id: "native_install",
          name: "Native Install Guide",
          icon: Rocket,
          description: "Instructions for running CriteriaIQ without Docker — direct Node.js installation on Linux or Windows server environments.",
          endpoint: "/api/docs/native-install",
        },
        {
          id: "dokploy_traefik_timeouts",
          name: "Dokploy & Traefik Timeouts",
          icon: Settings,
          description: "Configuration reference for Traefik reverse-proxy timeouts and Dokploy deployment labels ensuring long-running requests complete successfully.",
          endpoint: "/api/docs/dokploy-traefik-timeouts",
        }
      ]
    }
  ];

  // Flatten for backward compatibility
  // Posted/Updated dates for every doc, keyed by the same `endpoint`
  // value each item in `documentationCategories` carries. The server
  // derives these from `git log --follow` at build time so the
  // About-page card timestamps are always accurate — see
  // `scripts/bundle-runtime-docs.ts` and `server/docs-runtime-loader.ts`
  // for the bundle/dev-fallback contract. The query is cheap (one
  // shared response covers all 56 docs) and the response is
  // server-cached for 60s so a slow refresh doesn't repeatedly shell
  // out to `git log` in dev mode.
  const { data: docDatesMap } = useQuery<
    Record<string, { posted: string | null; updated: string | null }>
  >({
    queryKey: ['/api/docs/dates'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Format a raw ISO-8601 timestamp to the short YYYY-MM-DD form the
  // original hardcoded values used. Returns undefined for null/empty
  // so the card simply omits the badge for docs git doesn't know about
  // (e.g. a freshly-added markdown file not yet committed).
  const formatDocDate = (iso: string | null | undefined): string | undefined => {
    if (!iso) return undefined;
    return iso.slice(0, 10);
  };

  // Merge the live git-derived dates into each category item so the
  // DocumentationTab keeps its existing `postedAt`/`updatedAt` prop
  // contract without a schema change. While `docDatesMap` is still
  // loading, items render without dates (graceful — the prop is
  // optional in DocumentationTab).
  const documentationCategoriesWithDates = useMemo(() => {
    return documentationCategories.map((cat) => ({
      ...cat,
      items: cat.items.map((item) => {
        const dates = docDatesMap?.[item.endpoint];
        return {
          ...item,
          postedAt: formatDocDate(dates?.posted),
          updatedAt: formatDocDate(dates?.updated),
        };
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docDatesMap]);

  const documentationItems = documentationCategories.flatMap(cat => cat.items);

  // Check if user has Clear2Close access (Internal stakeholders including Admin)
  const hasClear2CloseAccess = user?.role && !['customer', 'partner', 'guest'].includes(user.role.toLowerCase());

  // About menu items
  const menuItems = [
    {
      id: "introduction",
      name: "Introduction",
      icon: Binoculars,
      description: "System Introduction and Guide"
    },
    ...(hasClear2CloseAccess ? [{
      id: "clear2close",
      name: "Clear2Close",
      icon: Atom,
      description: "Internal User Guide"
    }] : []),
    ...(hasDocumentationAccess ? [{
      id: "documentation",
      name: "Documentation",
      icon: BookKey,
      description: "Technical Documentation"
    }] : []),
  ];

  // Function to fetch documentation content
  const fetchDocumentation = async (endpoint: string, docId: string) => {
    setIsLoadingDoc(true);
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        const content = await response.text();
        setDocContent(content);
        setSelectedDoc(docId);
      } else {
        setDocContent("Failed to load documentation. Please try again or contact support.");
        setSelectedDoc(docId);
      }
    } catch (error) {
      setDocContent("Error loading documentation. Please check your connection and try again.");
      setSelectedDoc(docId);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Reset selected doc when switching tabs
  // Listen for URL parameter changes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    setDocParam(urlParams.get('doc') || undefined);

    if (tabParam && ['introduction', 'clear2close', 'documentation'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location]);

  // Listen for popstate events (triggered by sidebar navigation)
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      setDocParam(urlParams.get('doc') || undefined);

      if (tabParam && ['introduction', 'clear2close', 'documentation'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle tab changes and update URL
  const handleTabChange = (tabValue: string) => {
    setActiveTab(tabValue);
    // Update URL without triggering a page reload
    const newUrl = `/about?tab=${tabValue}`;
    window.history.pushState(null, '', newUrl);
  };

  useEffect(() => {
    if (activeTab !== "documentation") {
      setSelectedDoc(null);
      setDocContent("");
    }
  }, [activeTab]);

  // Enhanced markdown to HTML conversion with table and code formatting
  const convertMarkdownToHTML = (markdown: string): string => {
    // Now we get clean markdown directly from the API, so minimal processing needed
    let cleanedMarkdown = markdown
      .replace(/\n{3,}/g, '\n\n') // Replace 3+ line breaks with 2
      .replace(/^---$/gm, '') // Remove horizontal rules throughout
      .trim();

    let html = cleanedMarkdown
      // Convert tables with proper styling
      .replace(/(\|[^\n]+\|\n)+/g, (match) => {
        const rows = match.trim().split('\n');
        let tableHTML = '';
        let isFirstRow = true;
        let hasHeaderSeparator = false;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].trim();
          if (!row.startsWith('|') || !row.endsWith('|')) continue;

          const cells = row.split('|').slice(1, -1).map(cell => cell.trim());

          // Check if this is a separator row
          if (cells.every(cell => cell.match(/^[-:]+$/))) {
            hasHeaderSeparator = true;
            continue;
          }

          const cellTag = (isFirstRow && hasHeaderSeparator) || (isFirstRow && i === 0 && rows.length > 1 && rows[1].includes('---')) ? 'th' : 'td';
          const cellClass = cellTag === 'th'
            ? 'px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 font-semibold text-left text-gray-900 dark:text-gray-100'
            : 'px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300';

          const cellsHTML = cells.map(cell => {
            // Handle status indicators
            if (cell.toLowerCase().includes('completed')) {
              return `<${cellTag} class="${cellClass}"><span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-green-500 rounded-full"></span> Completed</span></${cellTag}>`;
            } else if (cell.toLowerCase().includes('progress')) {
              return `<${cellTag} class="${cellClass}"><span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-yellow-500 rounded-full"></span> In Progress</span></${cellTag}>`;
            } else if (cell.toLowerCase().includes('planned')) {
              return `<${cellTag} class="${cellClass}"><span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-gray-400 rounded-full"></span> Planned</span></${cellTag}>`;
            } else {
              return `<${cellTag} class="${cellClass}">${cell}</${cellTag}>`;
            }
          }).join('');

          tableHTML += `<tr>${cellsHTML}</tr>`;

          if (isFirstRow && hasHeaderSeparator) {
            isFirstRow = false;
          } else if (isFirstRow) {
            isFirstRow = false;
          }
        }

        return `<div class="overflow-x-auto my-6"><table class="min-w-full border-collapse bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-300 dark:border-gray-700">${tableHTML}</table></div>`;
      })
      // Convert code blocks with ultra-compact formatting matching raw markdown
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        // Ultra-compact processing - match raw markdown spacing exactly
        const ultraCompactCode = code
          .split('\n')
          .filter((line: string) => line.trim().length > 0 || line.length === 0) // Keep empty lines only if they're truly empty
          .join('\n')
          .replace(/^\n+/, '') // Remove leading newlines
          .replace(/\n+$/, '') // Remove trailing newlines
          .trim();
        return `<div class="my-4"><pre class="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3 overflow-x-auto text-sm"><code class="font-mono text-gray-800 dark:text-gray-200 block">${ultraCompactCode}</code></pre></div>`;
      })
      // Convert inline code
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1 rounded text-sm font-mono">$1</code>')
      // Convert system architecture diagrams and other ASCII-style diagrams with ultra-compact formatting
      .replace(/```\n([\s\S]*?)```/g, (match, content) => {
        // Check if this looks like any type of ASCII diagram
        if (content.includes('┌') || content.includes('│') || content.includes('└') || content.includes('─') ||
            content.includes('Frontend') || content.includes('Backend') || content.includes('Database') ||
            content.includes('◄──►') || content.includes('→') || content.includes('├')) {
          // Ultra-compact processing - remove ALL extra spacing
          const ultraCompactContent = content
            .split('\n')
            .map((line: string) => line.trimEnd()) // Remove trailing spaces but keep leading spaces for alignment
            .filter((line: string) => line.length > 0) // Remove completely empty lines
            .join('\n')
            .trim();
          return `<div class="my-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700 font-mono text-xs whitespace-pre overflow-x-auto">${ultraCompactContent}</div>`;
        }
        // Regular code block - already handled above
        return match;
      })
      .replace(/^---$/gim, '') // Remove horizontal rules (---)
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 mt-6">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3 mt-5">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2 mt-4">$1</h3>')
      .replace(/^#### (.*$)/gim, '<h4 class="text-base font-medium text-gray-800 dark:text-gray-200 mb-2 mt-3">$1</h4>')
      .replace(/^\* (.*$)/gim, '<li class="mb-1">$1</li>')
      .replace(/^- (.*$)/gim, '<li class="mb-1">$1</li>')
      .replace(/^(\d+)\. (.*$)/gim, '<li class="mb-1">$2</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline">$1</a>');

    // Clean up excessive spacing and handle paragraphs and lists more carefully
    html = html
      .replace(/\n{2,}/g, '\n') // Replace 2+ line breaks with 1 to eliminate spaces between lines
      .replace(/^\s*\n/, '') // Remove leading empty lines
      .replace(/\n\s*$/, '') // Remove trailing empty lines

    const htmlLines = html.split('\n');
    const processedLines = [];
    let inList = false;

    for (let i = 0; i < htmlLines.length; i++) {
      const line = htmlLines[i].trim();

      if (line === '') {
        // Skip empty lines entirely to remove spacing between content
        continue;
      }

      if (line.startsWith('<li')) {
        if (!inList) {
          processedLines.push('<ul class="list-none ml-0 mb-4 space-y-0">');
          inList = true;
        }
        // Process the list item to handle hanging indentation
        const content = line.replace('<li class="mb-1">', '').replace('</li>', '');
        processedLines.push(`<li class="mb-1 flex"><span class="mr-2 mt-0">•</span><span class="flex-1">${content}</span></li>`);
      } else {
        if (inList) {
          processedLines.push('</ul>');
          inList = false;
        }

        if (!line.startsWith('<h') && !line.startsWith('<ul') && !line.startsWith('</ul') &&
            !line.startsWith('<div') && !line.startsWith('<table') && !line.startsWith('<pre')) {
          processedLines.push(`<p class="mb-3 text-gray-700 dark:text-gray-300 leading-normal">${line}</p>`);
        } else {
          processedLines.push(line);
        }
      }
    }

    if (inList) {
      processedLines.push('</ul>');
    }

    // Return joined lines without extra spacing
    return processedLines.join('');
  };

  const renderContent = () => {
    switch (activeTab) {
      case "documentation":
        return <DocumentationTab documentationCategories={documentationCategoriesWithDates} initialDocId={docParam} />;
      case "clear2close":
        return <Clear2CloseTab />;
      case "introduction":
      default:
        return <IntroductionTab />;
    }
  };

  return (
    <div data-testid="about" className="space-y-4">
      <div className="h-full">
        <div className="max-w-full mx-auto space-y-8 h-full" style={{ width: '100%' }}>

          {/* Tab Navigation - Success Criteria Standard */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            {/* The tab bar comes from the sidebar (PageLayout's SectionTabBar). */}

            {/* Tab Content with standard spacing */}
            <div>
              {menuItems.map((item) => (
                <TabsContent value={item.id} key={item.id} className="mt-0 space-y-4">
                  {activeTab === item.id && renderContent()}
                </TabsContent>
              ))}
            </div>
          </Tabs>

        </div>
      </div>

    </div>
  );
}