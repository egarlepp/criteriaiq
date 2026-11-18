# Deployment and Versioning Guide

This document explains how to set up automatic versioning for self-hosted deployments (Hostinger VPS / Dokploy / Coolify / generic Docker).

## Recent Updates (v0.12.0) <!-- @managed-version: written by ./update-version.sh from version.json -->

**Multi-DB Management, Secret Lifecycle & Cleanup Schedulers (v0.7.20)**

**🔒 Security Changes**
- **App-Managed Bootstrap Secrets (Task #741):** `SESSION_SECRET` and `ENCRYPTION_KEY` can be promoted out of host-env into the encrypted app file or unmanaged back to host-env, with per-row Promote/Unmanage buttons on the Bootstrap Secrets card and masked Reveal-for-10s buttons on the Environment Variables panel. Reveal calls are suppressed from access logs and the env-status endpoint serves a server-rendered, credentials-masked URL preview by default
- **Encryption-Key Rotation Race Closed (Task #726):** Process-memory dual-key decrypt fallback eliminates the COMMIT/env-swap race where rows encrypted under the old key could become unreadable mid-rotation
- **Forced Logout on Session-Secret Rotation (Task #724, #736):** Rotating `SESSION_SECRET` invalidates every active admin session and surfaces a "you've been logged out" notice on the next page load
- **Rotation-In-Progress Banner (Task #734):** Live status banner shows countdown and re-encryption progress during the brief encryption-key rotation window
- **Boot-Time Data-Directory Health Check (Task #741):** Server probes `/data` writability at startup and on every health check; result is surfaced via `/api/system/health` so a read-only mount is caught before it silently breaks secret promotion or backups

**🆕 New Features**
- **Multi-DB Connection Management (Task #739):** File-canonical store at `/data/db-config.json` for managing multiple named database connections with AES-256-GCM-encrypted URLs, per-connection driver/SSL settings, and a typed-confirm safety gate on every destructive edit
- **Set-Active-for-Next-Restart Flow (Task #740):** Operators can stage a database switch that takes effect on the next restart instead of mid-request, via three new endpoints (GET / POST / DELETE `/api/db-connections/pending-active`) and a banner showing the pending target
- **Sessions Cleanup Scheduler & Admin Panel (Task #737, #745, #752):** Daily scheduler drops expired session rows; new "Sessions Cleanup" card on System Health → Database surfaces last-run timestamp, row count, duration, and exposes an admin "Run now" button
- **Login-History Cleanup Scheduler & Admin Panel (Task #746, #751, #756):** Daily prune of `audit_logins` with configurable retention; new "Login history cleanup" card on System Health → Database with admin "Run now" gated by a confirmation dialog (Task #758)
- **Bootstrap Secrets & Installed DB Visibility (Task #719):** New System Settings panel surfaces which secrets are app-managed vs host-env-managed and which database connection the install is currently using
- **Install-Time DB Row on Host-Env Installs (Task #731):** Fresh self-hosted installs see the install-time `DATABASE_URL` rendered as a real connection row in the manager so it can be promoted, edited, or replaced through the UI

**🔧 Improvements**
- **Repo-Wide JSON-Parsing Antipattern Sweep (Task #754):** Eliminated the broken `JSON.parse(await response.text())` pattern across the codebase, locked in via lint rule + regression tests
- **Audit-Logins Cleanup Snapshot Persists Across Restarts (Task #757):** Last-run snapshot stored on disk so the System Health card survives rolling deploys and OOM kills
- **Connection-Store Cleanup (Task #743):** Removed the unused `pendingActiveAnnouncementId` slot from the connection store — it was always null and risked cross-DB orphaned rows
- **Documentation Sync Workflow (Task #720):** Stopped auto-creating the Documentation Sync workflow schedule on boot; admins now opt in explicitly
- **Archived-User Notice Dismissal (Task #721):** New `dup_cleanup_notice_dismissed_at` column on `archived_users` preserves per-user dismissal state for the duplicate-cleanup notice
- **Bootstrap-Secrets Regression Suite (Task #725, #744):** New tests pin the call-order contract for the bootstrap-secrets reveal/regenerate handlers and the `seedBootstrapDbConnection` flow
- **Version System Update:** Application version bumped to v0.7.20 across all documentation files with the April 30, 2026 build date

**🐛 Fixes**
- **Hidden Secret-Rotation Copy Dialog (Task #749):** Broken JSON parsing was silently swallowing the new-key dialog after a successful rotation, leaving admins with no way to copy the freshly minted secret

## Previous Updates (v0.7.10)

**🔒 Security Changes**
- **Production Secret Hardening:** `enforceProductionSecrets()` fails fast in production when `SESSION_SECRET` or `ENCRYPTION_KEY` is missing once an approved admin exists; during the first-run bootstrap window, safe values are auto-generated so a fresh install never deadlocks on missing secrets
- **Status-Only vs Mutating Setup Routes:** `/api/setup/status` is always available for health checks; mutating bootstrap endpoints (`/initialize`, `/create-admin`, `/smtp`, etc.) are only registered during the bootstrap window and rejected once the system is initialized
- **Lazy Encryption Key Resolution:** `mfaUtils.ts` resolves `ENCRYPTION_KEY` at call-time so wizard-generated keys are usable in the same boot without restart

**🆕 New Features**
- **Rich-Text Editor Migration: MDXEditor → Tiptap (Task #196):** Big-bang replacement of `@mdxeditor/editor` with **Tiptap v3** across all 9 editor call sites (project notes, requirements, code-script descriptions, system announcements, customer artifacts). Markdown remains the storage format via `tiptap-markdown`; custom Admonition node round-trips `:::type … :::` fences losslessly. Four toolbar variants (`full` / `compact` / `minimal` / `code`), bubble menu, character/word count footer, @-mention typeahead, `:emoji:` shortcode picker, image upload with alignment, tables (header + resize + merge/split), task lists, YouTube embeds, syntax-highlighted code blocks (lowlight), and sub/super/highlight/text-color all included
- **Tiptap Markdown Round-Trip Regression Suite (Task #204):** 42 round-trip fixtures across 8 files (64 tests total with the admonition unit suite) covering admonitions, blocks, lists, marks, media, mentions, tables, and YouTube embeds; runs in seconds via Vitest to lock in storage compatibility
- **7-Step First-Run Setup Wizard:** `/setup` walks fresh installs through Database → Schema Migration → Admin Seed → Session/Encryption Secrets → SMTP → Public URL → Done with a live health panel
- **Self-Hosting Artifacts:** Production-ready `Dockerfile` (multi-stage, prunes dev deps then re-installs `drizzle-kit` for the wizard's schema-push step), `docker-compose.yml` with a Postgres service, and an expanded `.env.example` covering optional cloud storage (S3/MinIO/R2/GCS/Azure Blob) and AI providers (OpenAI, Anthropic, Gemini, Azure OpenAI)
- **Self-Hosting & First-Run Setup Documentation:** New `docs/features/first-run-setup.md` (wizard walkthrough + secret resolution model) and `docs/guides/self-hosting.md` (docker-compose, Hostinger VPS, and Dokploy paths); both linked from About and registered in `searchConfig`
- **Live Public-URL Reachability Probe:** Done step performs a real `fetch` against `${PUBLIC_APP_URL}/api/health` and reports the round-trip status, catching DNS/TLS/reverse-proxy misconfiguration before the admin leaves the wizard
- **Real Database Probe in Setup Status:** `/api/setup/status` executes a real `SELECT 1` against the configured `DATABASE_URL` and returns `dbReachable`
- **Deferred SMTP Hydration:** `smtp-hydrate.ts` applies wizard-supplied, encrypted SMTP settings on the first boot after setup completes

**🔧 Improvements**
- **Tiptap Component & File Rename:** All `Mdx*` rich-text editor files and components renamed to `Tiptap*` (e.g., `MdxEditor` → `TiptapEditor`, `MdxField` → `TiptapField`) for naming consistency with the underlying engine
- **Tiptap Lazy-Load & Pre-Bundle Optimization:** Editor and dependencies are lazy-loaded via `React.lazy` + `Suspense` and pre-bundled into a dedicated `vendor-editors` chunk in `vite.config.ts`, keeping the initial app bundle small while eliminating the cold-cache 504 timeout when opening editor cards
- **Expanded Tiptap Editor Documentation:** `docs/features/tiptap-editor-system.md` rewritten with full coverage of architecture, toolbar variants, extensions, storage format, admonition handling, mentions/emoji, lazy loading, testing, and migration history
- **Conditional Bootstrap Gating:** `server/index.ts` detects whether an approved admin exists and either enables auto-generated bootstrap secrets (fresh install) or enforces strict fail-fast hardening (post-setup), eliminating docker-compose first-boot deadlocks without weakening production posture
- **Smarter Auth Redirects:** `useAuth` treats `401` and `503` responses as a signal to check `/api/setup/status` and route uninitialized installs to `/setup` instead of looping back to the login page
- **Lazy Secret Helpers:** `server/lib/app-config.ts` exposes `getSessionSecret()`, `getEncryptionKey()`, and `getPublicAppUrl()` as call-time getters
- **Persistent Health Panel on Done Step:** Wizard final step no longer auto-redirects; it polls `/api/health` and shows a persistent panel with a "Go to Login" action
- **About Page Reorganization:** "First-Run Setup & Bootstrap" entry moved into the "Development & Components" category; "Self-Hosting Guide" remains under "Deployment"
- **Version System Update:** Application version bumped to v0.7.10 across all documentation files with the April 23, 2026 build date

**🐛 Fixes**
- **Editor Cold-Cache 504 Timeout:** Pre-bundling Tiptap dependencies in Vite resolved the 504 Gateway Timeout that occasionally fired the first time an editor card was opened on a freshly-loaded page
- **Admonition Markdown Round-Trip with Indented & Nested Fences:** Custom Admonition node now correctly preserves indented and nested `:::type` fences across save/reload, fixing data loss on deeply-structured content
- **Docker-Compose First-Boot Deadlock:** Fresh self-hosted containers no longer crash-loop with "missing SESSION_SECRET / ENCRYPTION_KEY" before the admin can reach the setup wizard
- **Wizard Schema-Push Failure:** Dockerfile now reinstalls `drizzle-kit` after pruning dev dependencies so the wizard's "Initialize Schema" step succeeds in production images
- **Setup Endpoint Hangs on Empty DB:** Status endpoint's `SELECT 1` probe uses a transient pool with a short timeout so misconfigured `DATABASE_URL` values surface clearly

## Previous Updates (v0.7.00)

**🔒 Security Changes**
- **Major Dependency Security Hardening:** Full stack upgrade addressing known CVEs: React 19.2, Express 5.2, TypeScript 6.0, Zod 4.3, Vite 8.0, Drizzle ORM 0.45, Lucide React 1.7, all Radix UI packages updated

**🔧 Improvements**
- **Reports Library Redesign:** Reports section now groups entries into My Reports, Other Reports, System Reports, and Inactive Reports collapsible categories, each wrapped in a Card with a 4-column auto-stretch card grid
- **Date Picker Year/Month Dropdown Navigation:** Calendar replaced prev/next arrow navigation with inline year and month dropdowns for fast direct-jump date selection
- **Tech Stack Page Refresh:** Technology Stack section in About → Introduction updated with accurate package versions reflecting the v0.7.00 upgrade
- **Version System Update:** Updated application version to v0.7.00 across all documentation files and configuration with April 2, 2026 build date

## Previous Updates (v0.6.20)

**🆕 New Features**
- **Error Audit Log Sidebar Submenu:** Admin-only 3rd-level sidebar entry under About → Support & Features for direct navigation to the error log view
- **Version System Update:** Updated application version to v0.6.20 across all documentation files and configuration with March 12, 2026 build date

**🔧 Improvements**
- **SubNavPopover for Support & Features:** Hover-dropdown navigation component replacing custom sub-tab buttons
- **SubNavPopover Label Wrapping Fix:** Long labels no longer wrap to two lines in dropdown menus
- **URL-Synced Subtab Navigation:** Support & Features page reads/writes subtab URL param for sidebar integration

## Previous Updates (v0.6.10)

**🆕 New Features**
- **Validation Criteria Solution Groups:** Criteria organized into collapsible dark purple solution group headers with per-group "Add Criterion" buttons; top-level "Add Criteria" button removed
- **Horizontal Accordion Field Layout:** New criterion entries show 5 fields as left-to-right collapsible icon panels with Status + Delete pinned to the right
- **5-Step Progress Tracker:** Numbered completion circles in "New Criterion Entry" header; purple for complete/active, amber for empty required fields
- **WebhookWizardModal Brand Icons:** Teams, Slack, Generic HTTP inline SVGs; step 1 redesigned as horizontal card rows with brand icons
- **Version System Update:** Updated application version to v0.6.10 across all documentation files and configuration with March 7, 2026 build date

**🔧 Improvements**
- **Smart Initial Step Selection:** New criteria auto-open to Component step when available, Value Mapping otherwise; solution data pre-fetched on section load
- **New Criterion Entry Header:** Renamed from "New Criteria Entry" with light purple background

## Previous Updates (v0.6.00)

**🆕 New Features**
- **Database Connection Manager:** DB management under Config → System Settings; two-layer architecture (file-based bootstrap + DB table); AES-256-GCM encrypted URL storage; test, activate, and manage named connections; activation writes to Layer 1 file and triggers clean restart
- **Backup Destinations Manager:** Named backup database targets with branch categorization, per-branch defaults, connection testing, and encrypted storage under Config → System Settings
- **DB Branching System:** Development/Production/Testing/Q&A/Sandbox/Other branch categories for both DB connections and backup destinations; color-coded collapsible grouped display with per-branch defaults independent of the global active-connection flag
- **First-Boot Setup Wizard:** `/setup` route for fresh installs with no database configured yet; pre-DB bootstrap file-based configuration
- **Version System Update:** Updated application version to v0.6.00 across all documentation files and configuration with February 26, 2026 build date

**🔧 Improvements**
- **Connection Testing:** MonitorCheck icon test button on DB Connection and Backup Destination cards; live latency/error display; persisted last-test result with time-ago
- **Branch-Grouped Card Display:** Collapsible color-coded section headers with item counts; branch-colored cards with branch icons
- **Deletion Protection:** System+active connections locked at API and UI level; tooltip guides user to activate a different connection first

## Previous Updates (v0.5.50)

**🔧 Improvements**
- **PDF Download — Multi-Tab Capture:** Rewrote downloadPDF to capture project header once then each visible tab separately; respects user role visibility automatically via DOM querying
- **Email Design Variables:** Added "Design & Branding" variable group with 8 new template variables; Insert Variable dropdown restructured into 3 labeled groups
- **StatusDistributionWidget:** Watermark background icons added to all 4 metric cards
- **ResizableModal Scrollbar:** Corrected scrollbar behavior (overflow-y-scroll, removed overflow-hidden)
- **Sidebar Width:** Expanded from 225px to 255px to eliminate horizontal scrollbar
- **Version System Update:** Updated application version to v0.5.50 across all documentation files and configuration with February 25, 2026 build date

**🐛 Fixes**
- **PDF Tab Repetition:** Fixed same first tab captured 4 times; replaced DOM .click() with React setActiveTab() + data-tab-value + requestAnimationFrame
- **EmailTemplatesSection Crash:** Fixed "X is not defined" runtime error (missing lucide-react icon import)

## Previous Updates (v0.5.40)

**🆕 New Features**
- **GitHub Documentation Sync Integration:** Sync product documentation from GitHub repositories for AI assessments with solution-to-docs mapping, incremental updates, content caching, and per-criterion doc section selection
- **Centralized Scheduling System:** AI assessment analysis and documentation sync scheduling integrated into the Workflow Automation framework
- **AI Assessment Enhancements:** Configurable data sources, custom instructions, detailed audit drawer, R-Index badges, assessment jobs section
- **Centralized Product Configuration:** Searchable combobox dropdown for documentation source product matching

**🔧 Improvements**
- **Schema Reorganization:** Split 5155-line shared/schema.ts into 13 domain-based files with barrel re-export for maintainability
- **Codebase Organization:** Automation components reorganized, changelog separated into dedicated component, file structure cleanup
- **SubNavPopover Navigation:** Artifact selection updated to use popover component
- **Workflow Automation UI:** Color-coded scheduled vs manual job sections, improved frequency display, wider cards
- **UI/UX Polish:** Button sizing, role management, spacing refinements across Account Management/Templates/Artifacts pages

**🐛 Fixes**
- Fixed AI Assessment schedules incorrectly marked as Manual
- Fixed documentation sources page crash from API data handling
- Fixed service import paths after schema reorganization
- Fixed schedule deletion sync across related pages
- Fixed toast notifications to use semantic system variants
- **Version System Update:** Updated application version to v0.5.40 across all documentation files and configuration with February 14, 2026 build date

## Previous Updates (v0.5.30)
- **New Custom Dashboard Widgets:** Added 3 new custom widgets to the Dashboard Builder: Account Metrics (customer statistics and trends), Project Schedules (timeline and deadline tracking), and Status Distribution (project status visualization with charts).
- **AI Providers Integration:** New AI Providers configuration in the Integrations section, enabling admin-managed multi-provider LLM integration support within the Configuration area.
- **Account Portal Overview Dashboard:** Created new Account Portal Overview dashboard connecting to the Dashboard Builder system, providing customers with personalized dashboard views and metrics.
- **Navigation Structure Updates:** Updated navigation with Account Management section (accounts, team-users, login-management), System Settings tab (fiscal-calendar, email-settings), and restructured Integrations with Salesforce sub-tabs and AI Providers.
- **Dashboard & Styling Enhancements:** Various UI/UX improvements across the dashboard system including enhanced widget rendering, improved styling consistency, and better user experience patterns.
- **Version System Update:** Updated application version to v0.5.20 across all documentation files and configuration with January 27, 2026 build date

## Previous Updates (v0.5.10)
- **Multi-Profile Infrastructure Intelligence:** New system for capturing deep technical infrastructure data across multiple customer environments. Features 8 color-coded accordion categories (Identity, Endpoint, Network, Storage, Application, Security, Operations, Cloud), multi-profile management, CRUD API for infrastructure profiles, and seamless profile switching.
- **Toast Notification System:** Standardized semantic variants (success, error, warning, info, confirm, loading) with automatic icons and auto-dismiss durations. Migrated 60+ files to semantic variants for consistent UX.
- **Code & Scripts Page:** New artifact type for capturing code snippets and scripts as part of project artifacts, enabling teams to document and share technical implementations discovered during validation projects.
- **Rebuilt Account Portal:** Complete UI/UX refresh of the Account Portal with improved navigation, modernized components, and enhanced user experience for account management.
- **Infrastructure Discovery UI Enhancement:** Added left accent bar hover effect to accordion categories using Tailwind group and data-state for proper state sync with Radix accordion.
- **Version Update Guide:** New documentation (`docs/guides/version-update-guide.md`) describing the complete version update process and checklist.
- **Version System Update:** Updated application version to v0.5.10 across all documentation files and configuration with January 12, 2026 build date

## Previous Updates (v0.5.00)
- **Guided Project Form:** Accordion-style Create/Edit Project form with 8 numbered sections (Essentials, Timeline, Team, Access, Requirements, MAP, Artifacts, Validation Criteria), color-coded steps, section completion tracking, and QuickJumpDropdown navigation. Template section uses "plain" variant in create mode only.
- **GuidedOverviewBanner:** Project metadata banner with live progress display and inline editable fields (Tech Risk, MGMT Ranking, Status) in edit mode with local state for immediate feedback and rollback on mutation error.
- **Project Navigator Drawer:** New sliding drawer for browsing and filtering all projects without leaving the edit page. Features ACV value display, sorting, and project switching.
- **UI/UX Library Expansion:** Enhanced UI Showcase with 6 new interactive sections (13 total, 50+ demos): Cursor Effects, Spring Physics, Staggered Animations, Command Palette (⌘K keyboard shortcut), 3D Card Flips, Scroll-Triggered Reveal. Added CSS animations (spring-bounce, wobble) and 3D transform utility classes.
- **3rd-Tier Sidebar Navigation:** Restored nested submenu for UI | UX Library with expandable accordion containing UI Showcase and Toast Showcase items.
- **Audit History Enhancement:** Added audit history button with status display and count on individual project details. Prevented accidental form submission when viewing audit history.
- **Form Enhancements:** Improved customer selections, validation criteria icons, project template display, primary engineer display, and creator tracking for new projects.
- **Version System Update:** Updated application version to v0.5.00 across all documentation files and configuration with December 21, 2025 build date

## Previous Updates (v0.4.90)
- **Outcome Intelligence System:** Project Closure Outcome & Intelligence System (PCOS) captures technical intelligence when projects close. Features Moneyball metrics (Technical Fit Score, Political Alignment Score, Pain Rating), configurable capture logic modes, reason codes, competitor tracking, gap linkage, and analytics dashboard with Quadrant Analysis and Pain Index distribution.
- **Account Portal UI Modernization:** Redesigned Account Portal with modernized collapsible card-based interface for account creation. Updated terminology from "Customer Portal" to "Account Portal" throughout UI for consistency.
- **Create User Dialog Enhancement:** Redesigned user creation form with 4-step wizard, color-coded sections, step validation, and enhanced selection logic for Solutions and Stakeholder Types.
- **Header Button Controls:** Added "Create Account" and "Create User" buttons to header bar for Team tab with event-driven architecture for cross-component communication.
- **New Documentation:** Added outcome-intelligence-system.md and gap-analysis-system.md documentation files
- **Version System Update:** Updated application version to v0.4.90 across all documentation files and configuration with December 16, 2025 build date

## Previous Updates (v0.4.80)
- **Gap Analysis System:** Comprehensive system for identifying, tracking, and managing solution limitations discovered during technical validation projects. Features gap types (Feature, Integration, Performance, Scalability, Documentation), MoSCoW criticality ratings (Must Have, Should Have, Nice to Have), workaround tracking, cross-project gap linking via many-to-many relationships, and customer rollup for Product Management visibility. Database tables: project_gaps, project_gap_links. Components: GapFormDialog, GapDrawer, AddGapDrawer, GapAnalysisTab, Gap Analysis page.
- **Audit History Drawer:** New sliding drawer component for viewing project audit history without leaving the current page. Provides comprehensive audit trail visibility with context-preserving navigation pattern.
- **Reusable Confirmation Dialogs:** Implemented ConfirmationDialog component for all destructive actions with red Siren icon, "destructive" variant for deletions, "warning" variant for other confirmations, and dark mode support.
- **Unsaved Changes Protection:** Added confirmation prompts before discarding unsaved changes across forms, preventing accidental data loss with user-friendly warning dialogs.
- **Form Enhancements:** Updated form labels and checkbox behavior for better usability. Improved project form styling and streamlined custom tag functionality.
- **UI/UX Improvements:** Added icons to profile settings and integration headings. Updated Salesforce connection text, background theme selection labels, and button icons for improved visual consistency.
- **Development Stability:** Addressed React Fragment props warning for cleaner development experience.
- **Version System Update:** Updated application version to v0.4.80 across all documentation files and configuration with December 9, 2025 build date

## Previous Updates (v0.4.70)
- **Flight Deck Engine Enhancements:** Major update to role-based welcome modal system with expanded widget capabilities and improved admin configuration experience.
- **Health Pulse Widget Expansion:** Added 5-bucket project status chart (Pending, Active, TCC, Closed, Stalled) with stacked bar visualization. New metrics: Pipeline Value, Win Rate, Workload Indicator, and Deal Urgency badges.
- **Risk Radar Technical Risk Chart:** New visualization showing Red/Yellow/Green risk distribution as mini horizontal bar chart with proportional segments and counts.
- **Widget Settings UI Enhancement:** Added emerald green icons to all Flight Deck widget settings for improved visual organization.
- **Weekly Scenario Support:** New display scenario for Flight Deck allowing specific weekday configuration (Monday-Friday).
- **Accessibility Improvements:** Fixed aria-hidden warnings with proper focus management in nested dialogs.
- **Version System Update:** Updated application version to v0.4.70 across all documentation files and configuration with December 5, 2025 build date

## Previous Updates (v0.4.60)
- **Global Search Expansion:** Enhanced Global Search to include documentation articles, navigation pages, Getting Started guides, and About page sections. Users can now quickly find any page, document, or guide directly from the command palette (Ctrl/Cmd+K).
- **Navigation Page Search:** Added 11 main menu items (Dashboard, Projects, Customers, Analytics, MAP, Communications, Artifacts, Configuration, About, Getting Started) to search results with role-based visibility matching sidebar permissions. Navigation items receive +10 score boost for quick access.
- **Documentation Search:** Indexed 25+ technical documentation articles organized by category (Project & Architecture, Development & Components, Integrations, Security, Database & Operations, Performance, Deployment). Documentation only visible to internal roles.
- **Getting Started Guides Search:** Added CriteriaIQ Workspace Guide and Introduction & Overview to search with keywords like "help", "guide", "tutorial". Guides receive +5 score boost.
- **Search Result UI Enhancements:** Added new icons (Home for navigation pages, BookOpen for guides) and color coding (Indigo for pages, Teal for guides). Results grouped by type with internationalized labels across 6 languages.
- **Version System Update:** Updated application version to v0.4.60 across all documentation files and configuration with December 1, 2025 build date

## Previous Updates (v0.4.50)
- **Project Board Enhancement:** Enhanced kanban-style project visualization with drag-and-drop functionality and real-time status updates (v0.4.50)
- **Webhook System:** Comprehensive outbound webhook system supporting Microsoft Teams, Slack, and generic HTTP endpoints with HMAC-SHA256 signing, AES-256-GCM encryption, Handlebars templating, and 65+ trigger integrations
- **Salesforce Field Mapping System:** Bidirectional sync between CriteriaIQ entities (Projects, Customers, Users) and Salesforce objects (Opportunities, Accounts, Contacts). Features admin-configurable mappings, three sync modes (Manual, Event-driven, Scheduled), value translation, conflict resolution with user notifications, and broken link detection
- **Salesforce Configuration UI:** New Configuration → Salesforce tab with Credentials, Field Mappings, and Sync Policies subtabs. Enhanced record linkage modal with contextual search
- **Database Schema Extensions:** 9 new Salesforce tables (salesforce_oauth_config, salesforce_describe_cache, salesforce_field_mappings, salesforce_record_links, salesforce_value_maps, salesforce_sync_queue, salesforce_sync_policies, salesforce_sync_runs, salesforce_sync_run_items). Webhook tables (webhooks, webhook_deliveries)
- **Documentation Enhancements:** Added Webhook Reference and Salesforce System documentation to About → Documentation page
- **Version System Update:** Updated application version to v0.4.50 across all documentation files and configuration with November 28, 2025 build date

## Previous Updates (v0.4.00)
- **All Solutions Architecture:** Implemented explicit `isAllSolutions` boolean flag system for universal entities (v0.4.00). Added `isAllSolutions` boolean column to Solutions, Components, Criteria, Expected Outcomes, and Actions tables with proper storage layer enforcement and backward compatibility for existing entities.
- **Show Hidden Feature:** Implemented independent solution-scoped searchable dropdowns with per-field "Show Hidden" checkboxes for N/A entity visibility. Auto-detection for validation templates containing N/A entities with `useDeferredValue` for debounced search performance.
- **Universal Status Configuration System:** Three new configuration tables (`status_configs`, `risk_level_configs`, `ranking_configs`) with RESTful CRUD endpoints, real-time WebSocket broadcasting, case normalization, and auto-seeding of default configurations.
- **Success Criteria Template Builder Enhancements:** Flexible hierarchical relationships with JSON-native architecture for instance_entities, drag-drop visual builder, and support for mixed hierarchies.
- **Database Schema Extensions:** New columns `isAllSolutions` (boolean, default: false) added to multiple tables. New configuration tables with consistent schema (id, name, color, icon, description, isActive, createdAt, updatedAt).
- **Version System Update:** Updated application version to v0.4.00 across all documentation files and configuration with November 19, 2025 build date

## Previous Updates (v0.3.40)
- **MAP User Assignments Filter Enhancement:** Improved User Assignments dialog with consolidated filter layout and dynamic count display for better UX (v0.3.40)
- **Single-Row Filter Layout:** Consolidated 4 filter dropdowns from 2 rows into single row in MapAssignmentDialog for cleaner interface and optimal screen space usage
- **Filter Reordering:** Reordered filters to logical flow: Assignments → Elements → Phases → Steps for intuitive hierarchical navigation
- **Dynamic Count Display:** Added live count indicators ("All {#} Phases", "All {#} Steps") providing real-time visibility into available filter options
- **Hierarchical Filtering:** Maintained Phase → Steps → Tasks filtering functionality with automatic step filter reset on phase changes
- **Version System Update:** Updated application version to v0.3.40 across all documentation files and configuration with October 31, 2025 build date

## Previous Updates (v0.3.30)
- **MAP Automation UI Enhancements:** Redesigned MAP Automation interface with improved button positioning and accordion functionality for better user experience (v0.3.30)
- **Button Layout Optimization:** Repositioned Reset/Save Changes buttons to top-right corner in MapAutomationTab using flex layout for consistent header alignment
- **Icon-Only Global Settings:** Converted Global Settings button to icon-only with "Go to Global Settings" hover tooltip in MapProjectAutomationTab for cleaner UI
- **Accordion Functionality:** Added expand/collapse accordion buttons to Auto-Completion Rules and Cascading Status Rules cards (both open by default) for improved content organization
- **Version System Update:** Updated application version to v0.3.30 across all documentation files and configuration with October 16, 2025 build date

## Previous Updates (v0.3.20)
- **Toast Showcase Integration:** Implemented Toast Showcase tab as final tab in About page navigation (after Language Translation), enabling inline display without page navigation (v0.3.20)
- **Component Architecture Enhancement:** Created dedicated ToastShowcaseTab component to resolve React hooks violation, properly utilizing hooks at component top level
- **Navigation Routing Update:** Updated all toast-related navigation to use `/about?tab=toast-showcase` route for consistent deep-linking
- **Icon Consistency Implementation:** Achieved icon standardization using MessageSquarePlus across all toast-related items
- **Version System Update:** Updated application version to v0.3.20 across all documentation files and configuration with October 10, 2025 build date

## Previous Updates (v0.3.10)
- **CSS & UI Standardization:** Fixed sidebar submenu active states by adding `:not(.bg-blue-100)` exclusion to CSS rules preventing transparent background override conflicts (v0.3.10)
- **Header Button Standardization:** Standardized all header buttons to use primary button styling system, removing hardcoded color values for consistent appearance across all pages
- **Body Overflow Fix:** Resolved unwanted second scrollbar issue by adding `overflow: hidden` to body element, allowing PageLayout component to exclusively handle page scrolling
- **CSS Architecture Enhancement:** Improved CSS specificity patterns with proper exclusion rules for active state classes, preventing override conflicts in sidebar navigation
- **Version System Update:** Updated application version to v0.3.10 across all documentation files and configuration with October 4, 2025 build date

## Previous Updates (v0.3.00)
- **Icon Picker System Integration:** Implemented comprehensive Lucide icon picker system with 1,400+ searchable icons and dynamic rendering capabilities (v0.3.00)
- **MAP System Foundation:** Comprehensive Mutual Action Plan feature with database foundation including 10 specialized tables and automatic initialization
- **Success Criteria Enhancement:** Implemented Success Criteria inactive state system with database persistence and filtered display
- **Rich Text Notes:** Integrated Tiptap (via the `TiptapEditor` wrapper, now Tiptap-based) for Project Notes field with Compact toolbar configuration

## Previous Updates (v0.2.20)
- **Support & Feature Request Management Enhancement:** Enhanced Support & Features dialog with improved title from "Request Management" to "Support and Feature Request Management" for clearer functionality description (v0.2.20)
- **Application Page Field Mapping:** Implemented user-friendly field mapping for Application Page display, showing descriptive names like "Customer Portal" instead of internal IDs for improved readability
- **Dialog Layout Optimization:** Improved badge positioning in Support & Features dialog to display below field names with Browser field spanning full width for better visual layout
- **Version Management Centralization:** Centralized application version management through version.json with robust fallback systems in server/routes.ts and sidebar.tsx ensuring consistent version display
- **Data Consistency Enhancement:** Updated form submission logic to store user-friendly display names instead of internal section IDs for improved data management and readability

## Previous Updates (v0.2.10)
- **Compliance & Regulations Management System:** Implemented comprehensive compliance regulations management with enhanced field structure, full CRUD functionality, CSV import/export capabilities with proper database integration, and consistent EarthLock iconography throughout the interface (v0.2.10)
- **Backend Storage Layer Enhancements:** Fixed critical backend storage bug where updateProduct method wasn't saving solutionIcon field, ensuring proper database persistence across create and update operations
- **React Query Integration for Icons:** Added automatic icon refresh mechanism using useEffect triggers when Add/Edit Solution dialogs open, replacing hardcoded dropdown options with dynamic filesystem-based loading
- **UI/UX Icon Improvements:** Updated lucide icons including UserRoundPlus for Create User button, primary styling for Upload Document button with black icon preservation, and SquarePen icon for edit operations
- **UI Consistency Enhancements:** Updated dialog titles and button text to use consistent "Compliance & Regulation" terminology with simplified button labels for improved user experience
- **Backend Schema Validation Fixes:** Fixed critical validation error by updating backend schema category enum to match frontend values, ensuring seamless compliance data operations
- **Enhanced Table Display Features:** Added Industry and Objective columns positioned after Regulation Name column with sortable functionality for better data management
- **Version System Standardization:** Updated application version to v0.2.10 across all documentation files, API endpoints, and configuration files with updated build metadata

## Previous Updates (v0.1.90)
- **Comprehensive Multi-Factor Authentication (MFA) System:** Implemented complete MFA infrastructure including TOTP authentication, WebAuthn passkeys, recovery codes, and enterprise-grade security health calculation (v0.1.90)
- **Advanced MFA Admin Management:** Created comprehensive administrative interface for MFA oversight with user security monitoring, bulk operations, and security health analytics
- **Security Infrastructure Enhancements:** Integrated AES-256-GCM encryption for TOTP secrets, bcrypt hashing for recovery codes, and rate limiting with configurable windows
- **Enhanced User Management Interface:** Improved user management table layouts with consistent field ordering and comprehensive MFA status integration
- **MFA Documentation System:** Added extensive MFA system documentation with implementation details and troubleshooting guides
- **Deployment Standards:** Maintained consistency in versioning format and environment variable configuration

## Previous Updates (v0.1.60)
- **Comprehensive Error Handling Implementation:** Added ErrorBoundary and PageErrorBoundary components for graceful error recovery across all application pages (v0.1.60)
- **System Stability Enhancement:** Implemented SafeLoader component and enhanced AI Risk Management error handling for improved application reliability
- **Translation System Completion:** Updated all locale files (en.json, de.json, es.json, fr.json, it.json, pt.json) with comprehensive translation coverage for dashboard components
- **Archive Management Improvements:** Enhanced Archive Management functionality with proper error handling and stability improvements
- **Global Error Handling Framework:** Implemented consistent error messaging and recovery options throughout the application
- **Deployment Standards:** Maintained consistency in versioning format and environment variable configuration

## Previous Updates (v0.1.50)
- **User Management Enhancement:** Implemented role-based User Account Approvals section with filtering capabilities in Dashboard - Users tab (v0.1.50)
- **Project Form Standardization:** Enhanced Create and Edit Project forms with consistent styling, icons, and user experience improvements
- **User Alert System:** Added comprehensive user login approval alerts across project forms with clear messaging and status indicators
- **Translation Expansion:** Extended 6-language support to cover all new dashboard and project form features
- **UI Consistency Improvements:** Strengthened Success Criteria form styling and overall application design consistency
- **Deployment Standards:** Maintained consistency in versioning format and environment variable configuration

## Previous Updates (v0.1.40)
- **Translation System Enhancement:** Implemented comprehensive internationalization improvements across all supported languages (v0.1.40)
- **UI/UX Consistency:** Enhanced system-wide user interface consistency with standardized components and error handling
- **Documentation Synchronization:** Updated all technical documentation files to align with current version and feature set
- **System Stability:** Strengthened overall application stability through improved error handling and translation fallback mechanisms
- **Deployment Standards:** Maintained consistency in versioning format and environment variable configuration

## Previous Updates (v0.1.32)
- **Environment Transition:** Successfully transferred complete codebase, database, and configurations to Enterprise workspace
- **Version Increment:** Updated to v0.1.32 with comprehensive UI/UX improvements and standardization
- **Documentation Refresh:** Updated all version references and build timestamps across technical documentation
- **Deployment Standards:** Maintained consistency in versioning format and environment variable configuration

## Current Versioning System

The application now supports automatic version management through environment variables and deployment scripts.

### Version Display

The version is shown in the bottom-left corner of the sidebar and is determined by:
1. `VITE_APP_VERSION` environment variable (highest priority)
2. Falls back to hardcoded `v0.2.20` if no environment variable is set

### Version API

The application provides a version API at `/api/version` that returns:
```json
{
  "version": "v0.2.20",
  "buildDate": "2025-09-20T00:00:00Z",
  "gitCommit": "support-feature-request-management-enhancements",
  "environment": "production"
}
```

## Setting Up Automatic Versioning

### Manual Version Updates

To manually update the version:

1. **Set environment variable:**
   ```bash
   export VITE_APP_VERSION="v0.1.90"
   ```

2. **Or create a .env file:**
   ```
   VITE_APP_VERSION=v0.1.90
   ```

### Version Format

The automatic versioning follows this pattern:
- Development: `v0.2.10` (simple format)
- Production: `v0.2.10-compliance-regulations-management-system-and-ui-consistency-enhancements-2509170000` (version-commit-timestamp)

## Best Practices

1. **Increment version numbers** for each deployment
2. **Use semantic versioning** (MAJOR.MINOR.PATCH)
3. **Set VITE_APP_VERSION** in your deployment environment
4. **Use the deployment script** for consistent builds
5. **Test version display** after deployment

## Troubleshooting

- If version shows as `v0.1.90`, check that `VITE_APP_VERSION` is set
- If API returns default values, ensure environment variables are set during build
- Verify secrets are configured in your host's deployment settings