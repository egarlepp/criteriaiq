export interface DocumentationItem {
  id: string;
  name: string;
  category: string;
  description: string;
  url: string;
}

export interface GettingStartedItem {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface AboutItem {
  id: string;
  name: string;
  description: string;
  url: string;
  requiresInternal: boolean;
}

// Page results (sidebar pages and their in-page views) are built on the
// client from the sidebar menu: see client/src/components/search/page-search-index.ts.

// NOTE: keep this list in sync with the `documentationCategories` array
// in client/src/pages/about.tsx — every entry's `doc=` value is the
// matching about.tsx item `id`, which the About page reads to deep-open
// the document. When you add a doc to the Documentation Library, add it
// here too (same id) so it's findable in global search.
export const documentationItems: DocumentationItem[] = [
  // ── Project & Architecture ───────────────────────────────────────────
  { id: 'doc-project-overview', name: 'Project Overview', category: 'Project & Architecture', description: 'High-level project summary, goals, stakeholders, and current status with key milestones', url: '/about?tab=documentation&doc=project_overview' },
  { id: 'doc-design-document', name: 'Design Document', category: 'Project & Architecture', description: 'Comprehensive design specifications including technical architecture, data models, and UX standards', url: '/about?tab=documentation&doc=design_document' },
  { id: 'doc-technical-architecture', name: 'Technical Architecture', category: 'Project & Architecture', description: 'Detailed technical implementation guide, system architecture, and development guidelines', url: '/about?tab=documentation&doc=technical-architecture' },
  { id: 'doc-workflow-diagrams', name: 'Workflow Diagrams', category: 'Project & Architecture', description: 'Visual workflow diagrams showing system processes, user flows, authentication, and project management', url: '/about?tab=documentation&doc=workflow_diagram' },
  { id: 'doc-map-architecture', name: 'MAP System Architecture', category: 'Project & Architecture', description: 'Mutual Action Plan system documentation: 11-table architecture, assignment framework, automation, real-time collaboration', url: '/about?tab=documentation&doc=map_system_architecture' },
  { id: 'doc-gap-analysis-system', name: 'Gap Analysis System', category: 'Project & Architecture', description: 'Gap Analysis system architecture, component locations, API endpoints, integration points, and tracking solution limitations', url: '/about?tab=documentation&doc=gap_analysis_system' },
  { id: 'doc-outcome-intelligence-system', name: 'Outcome Intelligence System', category: 'Project & Architecture', description: 'Project Closure Outcome & Intelligence System (PCOS): scoring methodology, Moneyball metrics, configurable capture logic, dashboard analytics', url: '/about?tab=documentation&doc=outcome_intelligence_system' },
  { id: 'doc-ai-assessment-system', name: 'AI Assessment System', category: 'Project & Architecture', description: 'Multi-ruleset AI Assessment system: database schema, data source registry, AI engine prompt construction, per-criterion targeting, extensibility', url: '/about?tab=documentation&doc=ai_assessment_system' },
  { id: 'doc-report-builder', name: 'Report Builder', category: 'Project & Architecture', description: 'Custom report authoring: server-driven field registry, color-coded source groups, dynamic JOIN executor, per-source filter examples, adding a new source', url: '/about?tab=documentation&doc=report_builder' },
  { id: 'doc-navigation-sitemap', name: 'Navigation Sitemap', category: 'Project & Architecture', description: 'Complete navigation hierarchy: all routes, query parameters, tabs, and sub-tabs for the 3-tier navigation architecture', url: '/about?tab=documentation&doc=navigation_sitemap' },
  { id: 'doc-application-startup-routing', name: 'Application Startup & Routing', category: 'Project & Architecture', description: 'Application startup sequence: provider hierarchy, authentication decision tree, route definitions, default landing page logic', url: '/about?tab=documentation&doc=application_startup_routing' },
  { id: 'doc-backlog', name: 'Backlog', category: 'Project & Architecture', description: 'Ideas and deferred follow-ups that are not scheduled yet: collaboration, UI, identity, integrations and engineering', url: '/about?tab=documentation&doc=backlog' },

  // ── Development & Components ──────────────────────────────────────────
  { id: 'doc-first-run-setup', name: 'First-Run Setup & Bootstrap', category: 'Development & Components', description: 'How the 7-step setup wizard takes a fresh PostgreSQL database to a logged-in admin: persistence, secret resolution, env-var bootstrap, health checks', url: '/about?tab=documentation&doc=first_run_setup' },
  { id: 'doc-sorting-system', name: 'Sorting System', category: 'Development & Components', description: 'Reusable sorting system utilities, components, and usage examples', url: '/about?tab=documentation&doc=sorting_docs' },
  { id: 'doc-tiptap-editor', name: 'Tiptap Editor System', category: 'Development & Components', description: 'Tiptap rich-text/markdown editor component system configuration and usage patterns', url: '/about?tab=documentation&doc=tiptap_editor_system' },
  { id: 'doc-icon-picker', name: 'Icon Picker System', category: 'Development & Components', description: 'Icon Picker component usage and modal integration patterns', url: '/about?tab=documentation&doc=icon_picker_system' },
  { id: 'doc-color-picker', name: 'ColorPicker System', category: 'Development & Components', description: 'Color Picker component system: palette, theming integration, and usage patterns', url: '/about?tab=documentation&doc=color_picker_system' },
  { id: 'doc-toast-system', name: 'Toast Notification System', category: 'Development & Components', description: 'Standardized toast notifications with 6 variants and i18n support', url: '/about?tab=documentation&doc=toast_notification_system' },
  { id: 'doc-language-translation', name: 'Language Translation', category: 'Development & Components', description: 'Internationalization guide, supported languages, translation workflows', url: '/about?tab=documentation&doc=language_translation' },
  { id: 'doc-adding-a-new-language', name: 'Adding a New Language', category: 'Development & Components', description: 'Step-by-step guide to add a new locale to the i18n system: locale file, config, switcher, translator hand-off', url: '/about?tab=documentation&doc=adding_a_new_language' },
  { id: 'doc-workflow-automation-triggers', name: 'Workflow Automation Triggers', category: 'Development & Components', description: 'Email/workflow trigger registration system and the catalog of system-defined triggers', url: '/about?tab=documentation&doc=workflow_automation_triggers' },
  { id: 'doc-workflow-automation-system', name: 'Workflow Automation System', category: 'Development & Components', description: 'Complete workflow automation: rules engine, conditions, actions, scheduling, and diagnostics', url: '/about?tab=documentation&doc=workflow_automation_system' },
  { id: 'doc-api-reference', name: 'API Reference', category: 'Development & Components', description: 'REST API reference with all endpoints, authentication, parameters, and response formats', url: '/about?tab=documentation&doc=api_reference' },
  { id: 'doc-workflow-triggers-reference', name: 'Workflow Triggers Reference', category: 'Development & Components', description: 'Reference catalog of every workflow/email automation trigger with payloads and contexts', url: '/about?tab=documentation&doc=workflow_triggers_reference' },
  { id: 'doc-webhook-reference', name: 'Webhook Reference', category: 'Development & Components', description: 'Webhook system for Teams, Slack, and HTTP integrations', url: '/about?tab=documentation&doc=webhook_reference' },
  { id: 'doc-global-search', name: 'Global Search System', category: 'Development & Components', description: 'Role-aware command palette search with keyboard shortcuts, navigation, docs, and entity results', url: '/about?tab=documentation&doc=global_search_system' },
  { id: 'doc-system-announcements', name: 'System Announcements Engine', category: 'Development & Components', description: 'Banner announcements engine: creation, targeting, scheduling, and the announcement bell', url: '/about?tab=documentation&doc=system_announcements' },
  { id: 'doc-flight-deck', name: 'Flight Deck Engine', category: 'Development & Components', description: 'Flight Deck welcome modal: widgets, tips, rules manager, and per-role configuration', url: '/about?tab=documentation&doc=flight_deck' },
  { id: 'doc-modern-card-styling', name: 'Modern Card Styling System', category: 'Development & Components', description: 'Composable card framework: DemoStatCard, RailConfig, AccentIconConfig, theming, and variant registry', url: '/about?tab=documentation&doc=modern_card_styling_system' },
  { id: 'doc-demo-mode', name: 'Demo Mode', category: 'Development & Components', description: 'Demo Mode admin feature: synthetic data isolation, resolution sources, admin-only configuration, and audit logging', url: '/about?tab=documentation&doc=demo_mode' },
  { id: 'doc-standard-table-pattern', name: 'Standard Table Pattern', category: 'Development & Components', description: 'Reusable sortable/filterable/paginated table: SortableTableHead per-column filters, URL-persisted filter state via useUrlFilterState, wiring recipe', url: '/about?tab=documentation&doc=standard_table_pattern' },
  { id: 'doc-storage-mixin-architecture', name: 'Storage Mixin Architecture', category: 'Development & Components', description: 'How DatabaseStorage is composed from 29 domain mixins, the declaration-merge + applyMixins pattern, and where to add a storage method', url: '/about?tab=documentation&doc=storage_mixin_architecture' },

  // ── Integrations ─────────────────────────────────────────────────────
  { id: 'doc-salesforce', name: 'Salesforce Field Mapping', category: 'Integrations', description: 'Bidirectional Salesforce sync, field mappings, and value translation', url: '/about?tab=documentation&doc=salesforce_system' },
  { id: 'doc-n8n', name: 'n8n Integration', category: 'Integrations', description: 'n8n workflow automation integration: bidirectional sync, webhook wizard, and workflow management', url: '/about?tab=documentation&doc=n8n_integration' },
  { id: 'doc-ai-provider-webhook', name: 'Webhook AI Provider — proxy completions through n8n', category: 'Integrations', description: 'Route AI assessment completions through n8n (or any HTTP endpoint) to dispatch to Azure AI Foundry, Bedrock, or an internal LLM gateway: the request/response contract, security modes, sample n8n workflow JSON, and the discovery dropdown sourced from the n8n integration', url: '/about?tab=documentation&doc=ai_provider_webhook' },

  // ── Security & Authentication ────────────────────────────────────────
  { id: 'doc-mfa', name: 'Multi-Factor Authentication (MFA)', category: 'Security & Authentication', description: 'MFA system including TOTP, WebAuthn passkeys, recovery codes, and security health', url: '/about?tab=documentation&doc=mfa_system_documentation' },
  { id: 'doc-account-user-management', name: 'Account & User Management', category: 'Security & Authentication', description: 'Account and user lifecycle: email domain restrictions, approval workflow, required fields, role permissions', url: '/about?tab=documentation&doc=account_user_management' },
  { id: 'doc-file-upload', name: 'File Upload System', category: 'Security & Authentication', description: 'Secure file upload pipeline: quarantine staging, ClamAV virus scanning, magic-byte validation, GCS storage, per-context size limits', url: '/about?tab=documentation&doc=file_upload_system' },
  { id: 'doc-approved-email-domains', name: 'Approved Email Domains', category: 'Security & Authentication', description: 'Self-registration gating by email domain: account-scoped and global allowed domains, auto-approve behavior, per-access-code domain narrowing', url: '/about?tab=documentation&doc=approved_email_domains' },
  { id: 'doc-secrets-management', name: 'Secrets Management', category: 'Security & Authentication', description: 'Secret lifecycle for SESSION_SECRET and ENCRYPTION_KEY: host-env vs app-managed, reveal/promote/unmanage/regenerate, production hardening', url: '/about?tab=documentation&doc=secrets_management' },
  { id: 'doc-encryption-key-rotation', name: 'Encryption Key Rotation', category: 'Security & Authentication', description: 'Rotating ENCRYPTION_KEY and SESSION_SECRET safely: AES-256-GCM, encrypted-column manifest, transactional re-encryption, dual-key fallback, rotation banner', url: '/about?tab=documentation&doc=encryption_key_rotation' },
  { id: 'doc-email-graph-sending', name: 'Email Sending — SMTP & Microsoft Graph', category: 'Security & Authentication', description: 'Outbound email transports: SMTP basic auth and the secure Microsoft Graph sendMail option — app-only OAuth, client secret or certificate, Application Access Policy, encrypted-at-rest credentials', url: '/about?tab=documentation&doc=email_graph_sending' },
  { id: 'doc-entra-app-registration', name: 'Entra App Registration Runbook (Graph Email)', category: 'Security & Authentication', description: 'Step-by-step Microsoft Entra app registration runbook for Graph email: Mail.Send application permission, admin consent, client secret or certificate, Application Access Policy PowerShell, and troubleshooting', url: '/about?tab=documentation&doc=entra_app_registration' },

  // ── Database & Operations ────────────────────────────────────────────
  { id: 'doc-backup-restore', name: 'Backup & Restore', category: 'Database & Operations', description: 'Download the whole database as one file and restore an install from it, with a preview and safety checks', url: '/about?tab=documentation&doc=backup_restore' },
  { id: 'doc-csv-import', name: 'CSV Import Guide', category: 'Database & Operations', description: 'Bulk importing solutions, criteria, outcomes via CSV', url: '/about?tab=documentation&doc=csv_import_guide' },
  { id: 'doc-archive-management', name: 'Archive Management System', category: 'Database & Operations', description: 'Soft-delete archive system for users, projects, and customers: archive/restore flows and archive-mirror schema parity', url: '/about?tab=documentation&doc=archive_management_system' },
  { id: 'doc-db-schema-refactor', name: 'Database Schema Refactor', category: 'Database & Operations', description: 'UUID PK migration, indexing strategy, query refactoring, risks and trade-offs', url: '/about?tab=documentation&doc=db_schema_refactor' },
  { id: 'doc-db-connection-manager', name: 'Database Connection Manager', category: 'Database & Operations', description: 'Multi-DB connection management: named connections, encrypted URLs, per-connection driver/SSL, set-active-for-next-restart', url: '/about?tab=documentation&doc=database_connection_manager' },
  { id: 'doc-db-connection-architecture', name: 'Database Connection Architecture', category: 'Database & Operations', description: 'Two-layer database config: file-based bootstrap config, env-var fallback, startup sequence, encryption model, restart mechanism', url: '/about?tab=documentation&doc=database_connection_architecture' },
  { id: 'doc-migration-strategy', name: 'Migration Strategy', category: 'Database & Operations', description: 'Claude Code workflow onboarding guide: CLAUDE.md prompt, coding-standard guardrails, and adoption strategy', url: '/about?tab=documentation&doc=migration_strategy' },
  { id: 'doc-system-health-dashboard', name: 'System Health Dashboard', category: 'Database & Operations', description: 'The 11-card System Health Overview: three-status model, what each card checks, headline rollup, API surface, adding a new health check', url: '/about?tab=documentation&doc=system_health_dashboard' },

  // ── Performance & Optimization ───────────────────────────────────────
  { id: 'doc-performance', name: 'Performance Monitoring', category: 'Performance & Optimization', description: 'Application performance monitoring and optimization guide', url: '/about?tab=documentation&doc=performance_monitoring' },
  { id: 'doc-websocket', name: 'WebSocket Stability', category: 'Performance & Optimization', description: 'WebSocket connection stability and troubleshooting', url: '/about?tab=documentation&doc=websocket_stability' },
  { id: 'doc-memory', name: 'Memory Management', category: 'Performance & Optimization', description: 'Memory management and leak prevention guidelines', url: '/about?tab=documentation&doc=memory_management' },
  { id: 'doc-error-handling', name: 'Error Handling & Debug', category: 'Performance & Optimization', description: 'Debugging and error handling with troubleshooting steps', url: '/about?tab=documentation&doc=error_handling_debug' },
  { id: 'doc-metric-history-system', name: 'Metric History System', category: 'Performance & Optimization', description: 'Metric history capture and retention: time-series snapshots, charting, and trend analysis', url: '/about?tab=documentation&doc=metric_history_system' },

  // ── Deployment ───────────────────────────────────────────────────────
  { id: 'doc-deployment', name: 'Deployment Guide', category: 'Deployment', description: 'Deployment instructions, versioning, and environment setup', url: '/about?tab=documentation&doc=deployment' },
  { id: 'doc-self-hosting', name: 'Self-Hosting Guide', category: 'Deployment', description: 'Self-host CriteriaIQ via docker compose, Hostinger VPS, or Dokploy with full first-run wizard walkthrough and troubleshooting', url: '/about?tab=documentation&doc=self_hosting' },
  { id: 'doc-version-update-guide', name: 'Version Update Guide', category: 'Deployment', description: 'How versions are managed and released: version.json, managed-version markers, changelog edits, lint:version gate', url: '/about?tab=documentation&doc=version_update_guide' },
  { id: 'doc-local-dev-setup', name: 'Local Development Setup', category: 'Deployment', description: 'Run CriteriaIQ locally on Windows: Postgres container, .env vars, secrets, and dev-server launch', url: '/about?tab=documentation&doc=local_dev_setup' },
  { id: 'doc-native-install', name: 'Native Install Guide', category: 'Deployment', description: 'Install CriteriaIQ natively (without Docker): Node, PostgreSQL, environment, and process management', url: '/about?tab=documentation&doc=native_install' },
  { id: 'doc-dokploy-traefik-timeouts', name: 'Dokploy & Traefik Timeouts', category: 'Deployment', description: 'Tuning Dokploy/Traefik proxy timeouts to avoid 504s on long-running requests', url: '/about?tab=documentation&doc=dokploy_traefik_timeouts' },
];

export const gettingStartedItems: GettingStartedItem[] = [

  // ── Getting Started Tabs (8 main tabs) ────────────────────────────────────
  { id: 'gs-tab-who',          name: "Who It's For",      description: "Engagement expectations for customers, stakeholders, and account teams participating in a technical validation project", url: '/getting-started?tab=who' },
  { id: 'gs-tab-workspace',    name: 'Workspace Guide',   description: 'Overview of CriteriaIQ core capabilities: real-time tracking, success criteria, MAP, documents, and collaboration', url: '/getting-started?tab=workspace' },
  { id: 'gs-tab-project-info', name: 'Project Info',      description: 'Field-by-field reference for project creation: account name, solution, business problem, Mutual Action Plan, customer objective, environment, timeline, and team', url: '/getting-started?tab=project-info' },
  { id: 'gs-tab-statuses',     name: 'Project Statuses',  description: 'Project and account status definitions, colors, and meanings: Planning, In Progress, Completed, TCC, Closed Won, Closed Lost, On Hold', url: '/getting-started?tab=statuses' },
  { id: 'gs-tab-interface',    name: 'Interface Guide',   description: 'Visual guide to navigating the project list, project detail view, success criteria section, artifacts, and account portal', url: '/getting-started?tab=interface' },
  { id: 'gs-tab-map',          name: 'MAP Guide',         description: 'Mutual Action Plan guide: what is a MAP, MAP architecture (Phases, Steps, Tasks), how-to guide, and MAP status color reference', url: '/getting-started?tab=map' },
  { id: 'gs-tab-resources',    name: 'Resources',         description: 'External Internal resources: support center, supported versions, technical guides, community forum, security glossary, compliance resources', url: '/getting-started?tab=resources' },
  { id: 'gs-tab-glossary',     name: 'Glossary',          description: 'Definitions for project terms, MAP terms, success criteria terms, and role terminology used throughout CriteriaIQ', url: '/getting-started?tab=glossary' },

  // ── Engagement Expectations (Who It's For tab) ────────────────────────────
  { id: 'gs-engage-before', name: 'Before Project Validation Starts', description: 'Pre-validation checklist: identify stakeholders, document business challenges, prepare test environment, define success criteria, block calendar time, coordinate IT access', url: '/getting-started?tab=who' },
  { id: 'gs-engage-during', name: 'During Active Project Validation', description: 'Validation execution guide: attend sessions, test hands-on, respond to engineer questions, update statuses, escalate blockers early, document gaps', url: '/getting-started?tab=who' },
  { id: 'gs-engage-after',  name: 'After Project Validation Completes', description: 'Post-validation steps: review final success criteria results, gather stakeholder feedback, discuss findings with decision-makers, communicate purchase decision', url: '/getting-started?tab=who' },

  // ── Project Status Definitions (Statuses tab) ─────────────────────────────
  { id: 'gs-status-planning',     name: 'Status: Planning',     description: 'Project status Planning — initial planning phase, scoping and preparation before execution begins', url: '/getting-started?tab=statuses' },
  { id: 'gs-status-in-progress',  name: 'Status: In Progress',  description: 'Project status In Progress — currently being executed with active validation work underway', url: '/getting-started?tab=statuses' },
  { id: 'gs-status-completed',    name: 'Status: Completed',    description: 'Project status Completed — successfully completed with all objectives met', url: '/getting-started?tab=statuses' },
  { id: 'gs-status-tcc',          name: 'Status: TCC',          description: 'Project status TCC (Technically Cleared To Close) — technical validation complete and ready for business decision and handoff', url: '/getting-started?tab=statuses' },
  { id: 'gs-status-closed-won',   name: 'Status: Closed Won',   description: 'Project status Closed Won — successfully closed, customer moved forward with purchase', url: '/getting-started?tab=statuses' },
  { id: 'gs-status-closed-lost',  name: 'Status: Closed Lost',  description: 'Project status Closed Lost — closed without success, customer did not proceed', url: '/getting-started?tab=statuses' },
  { id: 'gs-status-on-hold',      name: 'Status: On Hold',      description: 'Project status On Hold — temporarily paused, awaiting input or resources to resume', url: '/getting-started?tab=statuses' },

  // ── Account Status Definitions (Statuses tab) ─────────────────────────────
  { id: 'gs-acct-on-time',     name: 'Account Status: On Time',              description: 'Account status On Time — progressing as expected, no issues or delays', url: '/getting-started?tab=statuses' },
  { id: 'gs-acct-complete',    name: 'Account Status: Complete',             description: 'Account status Complete — all objectives have been met for this account', url: '/getting-started?tab=statuses' },
  { id: 'gs-acct-assistance',  name: 'Account Status: Need Assistance',      description: 'Account status Need Assistance — account requires support or guidance to continue', url: '/getting-started?tab=statuses' },
  { id: 'gs-acct-delayed',     name: 'Account Status: Delayed',              description: 'Account status Delayed — project is behind schedule and needs attention', url: '/getting-started?tab=statuses' },
  { id: 'gs-acct-on-hold',     name: 'Account Status: On Hold',              description: 'Account status On Hold — temporarily paused, not actively progressing', url: '/getting-started?tab=statuses' },
  { id: 'gs-acct-pending',     name: 'Account Status: Pending Feedback',     description: 'Account status Pending Feedback — waiting for review or approval from customer or stakeholders', url: '/getting-started?tab=statuses' },
  { id: 'gs-acct-cab',         name: 'Account Status: In CAB',               description: 'Account status In CAB — currently in Change Advisory Board review process', url: '/getting-started?tab=statuses' },
  { id: 'gs-acct-competitors', name: 'Account Status: Evaluating Competitors', description: 'Account status Evaluating Competitors — customer has additional vendor engagement, competitive evaluation underway', url: '/getting-started?tab=statuses' },
  { id: 'gs-acct-selecting',   name: 'Account Status: Selecting Solution',    description: 'Account status Selecting Solution — customer has decided to move forward with Internal', url: '/getting-started?tab=statuses' },

  // ── Glossary Terms (Glossary tab) ─────────────────────────────────────────
  { id: 'gs-gloss-poc',          name: 'POC (Proof of Concept)',           description: 'Glossary: POC — a controlled evaluation to test if a solution meets your needs before full purchase. Proof of Concept technical validation', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-tech-val',     name: 'Technical Validation',             description: 'Glossary: Technical Validation — the process of verifying a solution works in your specific environment and meets defined requirements', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-acv',          name: 'ACV (Annual Contract Value)',       description: 'Glossary: ACV — Annual Contract Value, the estimated yearly value of the contract or subscription being considered', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-tcc',          name: 'TCC (Technically Cleared to Close)', description: 'Glossary: TCC — Technically Cleared to Close, status indicating technical validation is complete and ready for business decision', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-map',          name: 'MAP (Mutual Action Plan)',          description: 'Glossary: MAP — a shared roadmap between your team and Internal outlining steps, responsibilities, and deadlines to complete the validation', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-phase',        name: 'MAP Phase',                        description: 'Glossary: Phase — a major milestone grouping in a MAP, such as Discovery, Implementation, or Review', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-step',         name: 'MAP Step',                         description: 'Glossary: Step — a specific action within a MAP phase, assigned to team members with deadlines', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-task',         name: 'MAP Task',                         description: 'Glossary: Task — a detailed work item within a MAP step, with time estimates and ownership assignment', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-criteria',     name: 'Success Criteria',                 description: 'Glossary: Success Criteria — measurable objectives that define what success looks like for your validation project', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-outcome',      name: 'Expected Outcome',                 description: 'Glossary: Expected Outcome — the anticipated result when a success criterion is successfully met', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-se',           name: 'Primary Engineer (SE)',             description: 'Glossary: Primary Engineer — your main Internal Solutions Engineer contact who leads the validation project', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-stakeholder',  name: 'Customer Stakeholder',             description: 'Glossary: Customer Stakeholder — your organization\'s primary decision-maker or technical lead for the validation project', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-guest',        name: 'Guest User',                       description: 'Glossary: Guest — a limited-access user who can view specific project information as granted by project administrators', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-milestone',    name: 'Milestone',                        description: 'Glossary: Milestone — a key progress point or deliverable within a MAP phase marking meaningful project advancement', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-dependency',   name: 'Dependency',                       description: 'Glossary: Dependency — a prerequisite task, resource, or approval that must be completed before another MAP step can proceed', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-saas',         name: 'SaaS',                             description: 'Glossary: SaaS (Software as a Service) — cloud-hosted software delivered via subscription, one of the supported deployment environments for validation projects', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-api',          name: 'API',                              description: 'Glossary: API (Application Programming Interface) — a technical term used in environment setup, integration configuration, and CriteriaIQ\'s 357-endpoint REST API', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-mfa',          name: 'MFA',                              description: 'Glossary: MFA (Multi-Factor Authentication) — a security requirement for CriteriaIQ user accounts including TOTP, WebAuthn passkeys, and recovery codes', url: '/getting-started?tab=glossary' },
  { id: 'gs-gloss-hybrid',       name: 'Hybrid Environment',               description: 'Glossary: Hybrid — a mixed deployment environment combining on-premises infrastructure with cloud or SaaS services for validation project setup', url: '/getting-started?tab=glossary' },

  // ── MAP Guide Sub-sections (MAP tab) ──────────────────────────────────────
  { id: 'gs-map-what-is',        name: 'What is a MAP',                    description: 'Mutual Action Plan definition: a shared buyer-seller roadmap outlining key steps, responsibilities, and deadlines to close a deal and complete validation', url: '/getting-started?tab=map' },
  { id: 'gs-map-architecture',   name: 'MAP Architecture',                 description: 'MAP hierarchical structure: Phases contain Steps, Steps contain Tasks — each with dates, owners, dependencies, and milestones', url: '/getting-started?tab=map' },
  { id: 'gs-map-quick-plan',     name: 'Quick plan or full MAP',           description: 'Every project plan is a Mutual Action Plan (MAP): when a Quick plan checklist is enough and when to use a full MAP template', url: '/getting-started?tab=map' },
  { id: 'gs-map-howto',          name: 'MAP How-to Guide',                 description: 'How to use your MAP: Access the roadmap, Track progress per phase, View timeline calendar, Check task assignments for Internal and customer teams', url: '/getting-started?tab=map' },
  { id: 'gs-map-colors',         name: 'MAP Status Colors',                description: 'MAP item color guide: Not Started (gray), In Progress (blue), Blocked (red), Complete (green), Deferred (yellow), Stalled (orange)', url: '/getting-started?tab=map' },

  // ── Project Info Fields (Project Info tab) ────────────────────────────────
  { id: 'gs-field-business-problem',    name: 'Business Problem Field',       description: 'Project field: Business Problem — summarize the customer challenge, risk, or operational gap driving the validation project', url: '/getting-started?tab=project-info' },
  { id: 'gs-field-solution-desc',       name: 'Solution Description Field',   description: 'Project field: Solution Description — explain how the selected solution addresses the customer\'s business problem', url: '/getting-started?tab=project-info' },
  { id: 'gs-field-map',                 name: 'Mutual Action Plan (MAP) Field', description: 'Project field: Mutual Action Plan — shared buyer-seller roadmap with key steps, responsibilities, and deadlines', url: '/getting-started?tab=project-info' },
  { id: 'gs-field-customer-objective',  name: 'Customer Objective Field',     description: 'Project field: Customer Objective — what the customer wants to achieve, their desired end state and measurable goals', url: '/getting-started?tab=project-info' },
  { id: 'gs-field-policy',              name: 'Policy Considerations Field',   description: 'Project field: Policy Considerations — security, privacy, compliance, governance requirements, CAB approval, GDPR, CMMC, PII', url: '/getting-started?tab=project-info' },
  { id: 'gs-field-environment',         name: 'Environment Field',             description: 'Project field: Environment — customer technical environment such as on-premises, hybrid, SaaS, cloud, or platform-specific architecture', url: '/getting-started?tab=project-info' },
  { id: 'gs-field-account-name',        name: 'Account Name Field',           description: 'Project field: Account Name — identify the customer organization tied to the project and opportunity', url: '/getting-started?tab=project-info' },
  { id: 'gs-field-solution-name',       name: 'Solution Name Field',          description: 'Project field: Solution Name — choose our solution or product set being validated in this project', url: '/getting-started?tab=project-info' },
  { id: 'gs-field-primary-engineer',    name: 'Primary Engineer Field',       description: 'Project field: Primary Engineer — assign the lead Solutions Engineer responsible for technical ownership and customer engagement', url: '/getting-started?tab=project-info' },
];

export const aboutItems: AboutItem[] = [

  // The About page's own tabs are sidebar pages, found via the client page index.

  // ── Clear2Close Phases (5A Framework) ────────────────────────────────────
  { id: 'about-c2c-phase1', name: 'Clear2Close Phase 1: Define the Proof and Attach', description: 'Clear2Close 5A Phase 1: Align and prove the business problem, technical use cases, validation scope, stakeholders, and success criteria. Attach to Salesforce opportunity', url: '/about?tab=clear2close', requiresInternal: true },
  { id: 'about-c2c-phase2', name: 'Clear2Close Phase 2: Assess the Validation',       description: 'Clear2Close 5A Phase 2: Assess environment, configure the MAP, set up AI assessment context, operational readiness and environment preparation', url: '/about?tab=clear2close', requiresInternal: true },
  { id: 'about-c2c-phase3', name: 'Clear2Close Phase 3: Affect the Validation',       description: 'Clear2Close 5A Phase 3: Execute the validation, prove solution value, run demos and testing sessions, document gaps and outcomes, run AI assessments', url: '/about?tab=clear2close', requiresInternal: true },
  { id: 'about-c2c-phase4', name: 'Clear2Close Phase 4: Align, Acquaint & Expand',   description: 'Clear2Close 5A Phase 4: Align to TCC (Technical Clearance to Close), confirm outcome, production path, expand to next-phase deployment and stakeholder alignment', url: '/about?tab=clear2close', requiresInternal: true },
  { id: 'about-c2c-phase5', name: 'Clear2Close Phase 5: Advance the Deal',           description: 'Clear2Close 5A Phase 5: Advance — finalize the technical close, prepare handoff to professional services, document leading indicators vs outcomes, manage gap handling and closeout intelligence', url: '/about?tab=clear2close', requiresInternal: true },

  // ── Introduction Capabilities ─────────────────────────────────────────────
  { id: 'about-intro-collaborative', name: 'Collaborative Workspace Capability',          description: 'CriteriaIQ capability: Collaborative Workspace — real-time multi-user access, team management, project sharing, and account portal for customer transparency', url: '/about?tab=introduction', requiresInternal: false },
  { id: 'about-intro-tvf',           name: 'Technical Validation Framework Capability',   description: 'CriteriaIQ capability: Technical Validation Framework — structured success criteria tracking, MAP integration, and outcome-driven validation process', url: '/about?tab=introduction', requiresInternal: false },
  { id: 'about-intro-analytics',     name: 'Advanced Analytics Capability',               description: 'CriteriaIQ capability: Advanced Analytics — custom reports, dashboard builder, metric builder, calendar views, and KPI tracking', url: '/about?tab=introduction', requiresInternal: false },
  { id: 'about-intro-rbac',          name: 'Role-Based Access Control',                   description: 'CriteriaIQ capability: RBAC — role-based access control with Admin, SE, AE, CS, Sales, CX, Product, ProServ, Support, Customer, Guest, Partner roles', url: '/about?tab=introduction', requiresInternal: false },
  { id: 'about-intro-portal',        name: 'Account Portal Capability',                   description: 'CriteriaIQ capability: Account Portal — customer-facing portal for tracking project progress, viewing MAP, and downloading PDF reports with 3D flip cards', url: '/about?tab=introduction', requiresInternal: false },
  { id: 'about-intro-realtime',      name: 'Real-Time Updates',                           description: 'CriteriaIQ capability: Real-Time Updates — live project status changes, audit trail, notifications, and WebSocket-powered real-time data synchronization', url: '/about?tab=introduction', requiresInternal: false },
  { id: 'about-intro-tech-stack',    name: 'Technology Stack',                            description: 'CriteriaIQ technology: React, Vite, Tailwind, Node.js, Express, Drizzle ORM, PostgreSQL, Neon database, MFA, RBAC — full stack overview', url: '/about?tab=introduction', requiresInternal: false },
  { id: 'about-intro-roles',         name: 'User Roles Overview',                         description: 'CriteriaIQ user roles: Admin, SE (Solutions Engineer), AE (Account Executive), CS, Sales, CX, Product, ProServ, Support, Customer, Guest, Partner — permissions and access', url: '/about?tab=introduction', requiresInternal: false },

  // ── Language Translation Guide ────────────────────────────────────────────
];
