# CriteriaIQ Navigation Sitemap

> **Last Updated:** October 28, 2026  
> **Version:** v0.12.0 <!-- @managed-version: written by ./update-version.sh from version.json -->  
> **Maintainer:** Update this document when navigation structure changes or during version updates.

## Overview

CriteriaIQ uses a **3-Tier URL Architecture** (page → `?tab=` → `?subtab=` / `?subtab2=`), but the **sidebar shows at most two levels**:
- The sidebar is organized into job-based **groups** (Home, Work, Library, Insights, Help, Admin) shown as small headings. The CriteriaIQ logo sits at the top of the sidebar (the logo mark only when collapsed), level with the 70px header bar; the header shows the page title on the left and, at the far right past the icon buttons, the graphic chosen in Configuration → Media (the uploaded sidebar logo, else the sidebar watermark).
- **Admin is one sidebar entry.** Its group is marked `secondTier` in `sidebar-nav-config.ts`: the sidebar shows a single **Admin** item, and on any Admin page `PageLayout` renders `SecondTierNav` (`client/src/components/layout/second-tier-nav.tsx`), a full-height menu under the header between the sidebar and the page, listing ImpactIQ-style categories (Projects & Rules, Team & People, Workplace, Integrations, Appearance, Monitoring & Audit, Demo) as collapsible sections with their pages. **Every Admin page lives on one URL, `/admin?tab=<page>`** (`client/src/pages/admin.tsx` picks the screen that renders the tab), so moving between Admin pages never loads another page. Old Admin URLs (`/config`, `/communications`, `/archive-management`, About › Support & Features, Account Management › Login Management) redirect there (`client/src/lib/admin-redirects.ts`, run by `AdminRedirects` in `App.tsx`). Clicking Admin from elsewhere opens Monitoring & Audit › App Health; on an Admin page the menu is always open and clicking Admin does nothing; it closes when you leave Admin. Admin pages never show their category's tab bar, since the menu lists those pages. A page that switches views lists them as `views` on its sidebar entry, and those views are its top tab bar: Workflow Automation, Integrations › Salesforce and HubSpot, App Health and Archive Management. Admin pages have no "View:" dropdown.
- Each group lists **items**; an item may open **one** level of children.
- Anything deeper (Report Builder steps, …) is reached through the page's own in-page navigation — the **"View: …"** switcher (`SubNavPopover`) or the page's tab bar — not the sidebar.
- **The top tab bar mirrors the sidebar.** On any page that belongs to a sidebar item with children, `PageLayout` renders `SectionTabBar` (`client/src/components/layout/section-tab-bar.tsx`): one tab per child of that item, in sidebar order and with the same permission filtering. Pages no longer hand-wire their own top tab bar. The tab bar is treated as part of the header: the gap below it is the same 16px every page gets below the header bar, and pages add no extra top margin of their own. A page that is a single sidebar entry (Dashboard, Create Project) shows no top tab bar. The header title follows the open sidebar item on pages that host several (`/project`, `/account`, `/admin`, `/about`), e.g. Compliance shows **Knowledge**. Every tab of a section lives on the same page (pathname), so switching tabs never reloads the page; when a page moves to another section, move its URL too and add a redirect in `client/src/lib/admin-redirects.ts` (a sidebar test enforces this). Account Portal, the main page for customers, guests and partners, is its own Work entry on its own `/account` page. Template Management (all its pages, including Value Journey), Validation Criteria, Artifacts, Compliance, Analytics (Reports, Calendar, Report Builder), Communications (Email Logs, Email Templates, Email Designs), Configuration (all five tabs), System Health, Integrations, Archive Management and Outcome Intelligence have no in-page title card. A page that must guard a tab switch listens for the cancelable `section-tab-navigate` window event (Analytics does, for unsaved builders).

Routes are defined in `client/src/App.tsx`. The sidebar menu is defined **once** in `client/src/components/layout/sidebar-nav-config.ts` (`SIDEBAR_NAV`); `sidebar.tsx` only renders it. Add, move or rename menu entries there — active state and permission filtering are generic.

---

## Main Sidebar Navigation

Groups and items as defined in `sidebar-nav-config.ts`. **Section ID** matches `client/src/lib/permission-sections.ts`; an item without one (Account Management, Knowledge) is shown when any of its children is visible.

| Group | Item | Children (one level) | Section ID |
|-------|------|----------------------|------------|
| Home | Dashboard | — | `dashboard` |
| Work | Create Project | — | `create` |
| Work | Project Workspace | Projects · Project Board · Project Schedules · MAP Management · Gap Analysis | `project` |
| Work | Account Portal | — | `customer` |
| Work | Account Management | Account Directory · Team & Users | `project.customers` |
| Library | Template Management | Project Templates · Validation Criteria Builder · MAP Library · Value Journey | `template_management` |
| Library | Validation Criteria | Solutions · Components · Value Mapping · Criteria · Expected Outcomes · Actions Taken | `success-criteria` |
| Library | Knowledge | Assumptions · Dependencies · Competitor Intelligence · Artifacts · Compliance | per child (`project.*`, `config.compliance`) |
| Insights | Reports | Library · Calendar | `analytics` |
| Insights | Outcome Intelligence | Quadrant Analysis, Reason Codes, Missing Outcomes, All Outcomes (`?subtab2=`; Quadrant Analysis by default) | `project.outcome-intelligence` |
| Insights | AI Assessments | Project Analysis · Assessment Criteria · Documentation Sources | `ai-risk` |
| Help | Guide | — | `getting_started` |
| Help | About | Introduction · Clear2Close · Documentation | `about` |
| Admin | Projects & Rules | Field Settings · Outcome Intelligence · Workflow Automation | `config.configuration`, `config.system-settings`, `config.workflow-automation` |
| Admin | Team & People | Users · Role Management · Login Management | `config.user-management` |
| Admin | Workplace | Calendar · Terminology (Admin) · Announcements (Admin) · Flight Deck (Admin) · Email Templates · Email Designs · Support Requests | `config.system-settings`, `config.email-configuration`, `communications.*`, `about.support-features` |
| Admin | Integrations | Overview · Salesforce · HubSpot · AI Providers · Webhooks (Admin) · n8n · MCP Server · Storage Providers (Admin) (only the chosen CRM's page is listed; Overview lists every integration with its status, groups the CRM card with the Salesforce, HubSpot and Validation Record cards, configures Okta SSO, Azure SSO and Email Configuration inline (`&open=email` opens the Email card), and holds the global Rate Limiting card) | `config.salesforce-configuration`; Webhooks `config.email-configuration`; Storage Providers `config.system-settings` |
| Admin | Appearance (Admin) | Theming · Media | `config.appearance` |
| Admin | Monitoring & Audit | App Health · Login History · Email Logs · Error Log (Admin) · Page Usage (Admin) · Scheduler · Database Connection · Backup & Restore (Admin) · Archive Management | `config.system-health`, `config.user-management`, `communications.email-logs`, `about.support-features`, `config.scheduler`, `config.system-settings`, `config.archives`; the category shows when any page is viewable |
| Admin | Demo | Demo Mode | `config.demo-mode` |

URLs and permission section ids are unchanged from the previous flat menu, so bookmarks and role grants keep working. The per-page tables below describe the full URL hierarchy (including levels now reached in-page).

---

## Detailed Navigation Hierarchy

### 1. Dashboard
Single top-level page at `/` (no sub-tabs), governed by the `dashboard` section. Formerly "Overview" with Dashboard + Team Management tabs; Team Management was never built and was removed.

---

### 2. Account Portal
Header bar title: **Account Portal**. Its own Work entry, the main page for customers, guests and partners.

| Route | Component | Description |
|-------|-----------|-------------|
| `/account` | `CustomerDashboard` | Customer/Account management portal |
| `/account-portal` | `CustomerDashboard` | Alias for Account Portal |

---

### 3. Create Project
| Route | Component | Description |
|-------|-----------|-------------|
| `/create` | `CreateProject` | New project creation form |
| `/create-project` | `CreateProject` | Alias for Create Project |

---

### 4. Project Workspace (`/project`)
**Base Route:** `/project`  
**Component:** `Project`

`/project` hosts several sidebar items, and the header bar title and top tab bar follow whichever is open: **Project Workspace** (`tab=validation`, Projects through Gap Analysis), **Account Management** (`tab=customers`), **Knowledge** (Assumptions, Dependencies, Competitor Intelligence, Artifacts) and **Outcome Intelligence** (Quadrant Analysis, Reason Codes, Missing Outcomes, All Outcomes; its four KPI cards sit inside the Search & Filters card on every view). There is no in-page title card or "View:" switcher on the Project Workspace or Account Management views; Search & Filters is the first card. `/project?tab=customers` with no subtab is treated as Account Directory.

| Tab | SubTab | SubTab2 | URL | Section ID | Description |
|-----|--------|---------|-----|------------|-------------|
| **Project Workspace** | | | | `project.validation` | |
| `validation` | `projects` | | `/project?tab=validation&subtab=projects` | | Project list view |
| `validation` | `project-board` | | `/project?tab=validation&subtab=project-board` | | Kanban board view |
| `validation` | `calendar` | | `/project?tab=validation&subtab=calendar` | | Project schedules |
| `validation` | `map` | | `/project?tab=validation&subtab=map` | | MAP Management |
| `validation` | `gap-analysis` | | `/project?tab=validation&subtab=gap-analysis` | | Gap Analysis tracking |
| `validation` | `competitors` | | `/project?tab=validation&subtab=competitors` | | Competitor Intelligence |
| `validation` | `outcome-intelligence` | `quadrant` | `/project?tab=validation&subtab=outcome-intelligence&subtab2=quadrant` | | Quadrant Analysis |
| `validation` | `outcome-intelligence` | `reasons` | `/project?tab=validation&subtab=outcome-intelligence&subtab2=reasons` | | Reason Codes |
| `validation` | `outcome-intelligence` | `missing` | `/project?tab=validation&subtab=outcome-intelligence&subtab2=missing` | | Missing Outcomes |
| `validation` | `outcome-intelligence` | `all` | `/project?tab=validation&subtab=outcome-intelligence&subtab2=all` | | All Outcomes |
| **Account Management** | | | | `project.customers` | |
| `customers` | `accounts` | | `/project?tab=customers&subtab=accounts` | | Account Directory |
| `customers` | `team-users` | | `/project?tab=customers&subtab=team-users` | | Account Users |
| **Artifacts** | | | | `project.artifacts` | |
| `artifacts` | `documents` | | `/project?tab=artifacts&subtab=documents` | | Document management |
| `artifacts` | `links` | | `/project?tab=artifacts&subtab=links` | | Link management |
| `artifacts` | `code-scripts` | | `/project?tab=artifacts&subtab=code-scripts` | | Code & Scripts |
| `compliance` | | | `/project?tab=compliance` | `config.compliance` | Compliance & Regulations (Knowledge). Old `/config?tab=compliance` links redirect here |

**Project Detail Routes:**
| Route | Component | Description |
|-------|-----------|-------------|
| `/project/:id` | `ProjectDetail` | Individual project detail page |
| `/project/:id/audit` | `ProjectAudit` | Project audit history |
| `/edit-project/:id` | `EditProject` | Edit existing project |

---

### 5. Template Management
**Base Route:** `/templates`  
**Component:** `Templates`

| Tab | URL | Section ID | Description |
|-----|-----|------------|-------------|
| `project-templates` | `/templates?tab=project-templates` | `template_management.project-templates` | Project templates |
| `criteria-builder` | `/templates?tab=criteria-builder` | `template_management.criteria-builder` | Validation Criteria Builder |
| `map-library` | `/templates?tab=map-library` | `template_management.map-library` | MAP Library |
| `value-journey` | `/templates?tab=value-journey` | `template_management.value-journey` | Value Journey stages ([value-journey.md](../features/value-journey.md)) |

**Related Standalone Route:**
| Route | Component | Description |
|-------|-----------|-------------|
| `/edit-template` | `EditTemplate` | Edit an existing template |

---

### 6. Validation Criteria
**Base Route:** `/success-criteria`  
**Component:** `SuccessCriteria`

| Tab | URL | Section ID | Description |
|-----|-----|------------|-------------|
| `solutions` | `/success-criteria?tab=solutions` | `success-criteria.solutions` | Solution management |
| `components` | `/success-criteria?tab=components` | `success-criteria.components` | Component library |
| `value-mapping` | `/success-criteria?tab=value-mapping` | `success-criteria.value-mapping` | Value Mapping |
| `criteria` | `/success-criteria?tab=criteria` | `success-criteria.criteria` | Criteria definitions |
| `outcomes` | `/success-criteria?tab=outcomes` | `success-criteria.outcomes` | Expected Outcomes |
| `actions` | `/success-criteria?tab=actions` | `success-criteria.actions` | Actions Taken |

The old `/success-criteria?tab=assumptions` tab was removed (it duplicated Library › Knowledge › Assumptions); that URL now redirects to `/project?tab=validation&subtab=assumptions`.

---

### 7. AI Assessments
**Base Route:** `/ai-risk` or `/ai-risk-management`  
**Component:** `AIRisk`

| Tab | URL | Section ID | Description |
|-----|-----|------------|-------------|
| `projects` | `/ai-risk-management?tab=projects` | `ai-risk.projects` | Project Analysis |
| `criteria` | `/ai-risk-management?tab=criteria` | `ai-risk.criteria` | Assessment Criteria configuration |
| `docs` | `/ai-risk-management?tab=docs` | `ai-risk.docs` | Documentation Sources |

---

### 8. Communications
Email Logs, Email Templates, Email Designs, Announcements, Flight Deck and Webhooks are Admin pages; see **10. Admin**.

---

### 9. Reports
**Base Route:** `/reports` (Insights › Reports, one menu entry, no tabs)  
**Component:** `Reports`

The report library and the scheduled-send calendar are one page
([scheduled-reports-calendar.md](../features/scheduled-reports-calendar.md)).
Report Builder, Dashboard Builder and Metric Builder were archived to
`archive/analytics-builders/`. `/analytics` (any tab) and `/report-builder`
redirect here.

| View | URL | Section ID | Description |
|------|-----|------------|-------------|
| Library | `/reports` | `analytics.main` | Report table with a calendar rail |
| Calendar | `/reports?view=calendar` | `analytics.main` | Full-width calendar; the table folds to one line |

---

### 10. Admin
**Base Route:** `/admin`  
**Component:** `Admin` (`client/src/pages/admin.tsx`), which renders the Configuration, Communications, Archive Management or Support Requests screen for the tab.

| Category | Tab | SubTab | URL | Section ID | Description |
|----------|-----|--------|-----|------------|-------------|
| Projects & Rules | `configuration` | | `/admin?tab=configuration` | `config.configuration` | Field Settings |
| Projects & Rules | `outcome-configuration` | | `/admin?tab=outcome-configuration` | `config.system-settings` | Outcome Intelligence capture rules |
| Projects & Rules | `workflow-automation` | `automation-feed` · `rules` · `origins` · `diagnostics` · `map-automation` | `/admin?tab=workflow-automation&subtab=rules` | `config.workflow-automation` | Workflow Automation (views are its tab bar) |
| Team & People | `users` | | `/admin?tab=users` | `config.user-management` | User list |
| Team & People | `roles` | | `/admin?tab=roles` | `config.user-management` | Role Management |
| Team & People | `login-management` | | `/admin?tab=login-management` | `config.user-management` | Login Management |
| Workplace | `fiscal-calendar` | | `/admin?tab=fiscal-calendar` | `config.system-settings` | Calendar (card "Calendar Configurations"); holiday calendars are Admin only |
| Workplace | `terminology` | | `/admin?tab=terminology` | `config.system-settings` (Admin only) | Validation record name |
| Workplace | `system-announcements` | | `/admin?tab=system-announcements` | `config.email-configuration` (Admin only) | Announcements and maintenance windows |
| Workplace | `flight-deck` | | `/admin?tab=flight-deck` | `config.email-configuration` (Admin only) | Flight Deck rules |
| Workplace | `email-templates` | | `/admin?tab=email-templates` | `communications.email-templates` | Email templates |
| Workplace | `email-designs` | | `/admin?tab=email-designs` | `communications.email-designs` | Email designs |
| Workplace | `support-requests` | | `/admin?tab=support-requests` | `about.support-features` | Support requests and feature requests |
| Integrations | `salesforce-configuration` | `overview` · `salesforce` · `hubspot` · `ai-providers` · `n8n` · `mcp-server` | `/admin?tab=salesforce-configuration&subtab=overview` | `config.salesforce-configuration` | Integrations; Salesforce and HubSpot views use `sfsubtab=` (credentials, field-mappings, sync-policies, sync-history) |
| Integrations | `webhooks` | | `/admin?tab=webhooks` | `config.email-configuration` (Admin only) | Outbound webhooks |
| Integrations | `storage-providers` | | `/admin?tab=storage-providers` | `config.system-settings` (Admin only) | Storage providers |
| Appearance | `appearance` | `theming` · `media` | `/admin?tab=appearance&subtab=theming` | `config.appearance` (Admin only) | Theming and Media |
| Monitoring & Audit | `system-health` | `overview` · `database` · `email` · `integrations` · `security` · `services` · `storage` · `performance` · `archive` | `/admin?tab=system-health&subtab=overview` | `config.system-health` | App Health (default Admin page) |
| Monitoring & Audit | `login-history` | | `/admin?tab=login-history` | `config.user-management` | Sign-in activity |
| Monitoring & Audit | `email-logs` | | `/admin?tab=email-logs` | `communications.email-logs` | Email log history |
| Monitoring & Audit | `error-log` | | `/admin?tab=error-log` | `about.support-features` (Admin only) | Client error log |
| Monitoring & Audit | `page-usage` | | `/admin?tab=page-usage` | `config.system-health` (Admin only) | Page Usage |
| Monitoring & Audit | `scheduler` | | `/admin?tab=scheduler` | `config.scheduler` | Background jobs, workflow schedules and the Send Email Window |
| Monitoring & Audit | `database-connection` | | `/admin?tab=database-connection` | `config.system-settings` | Database Connection Manager |
| Monitoring & Audit | `backup` | | `/admin?tab=backup` | `config.system-health` (Admin only) | Backup & Restore |
| Monitoring & Audit | `archive` | `log` · `users` · `projects` · `customers` | `/admin?tab=archive&subtab=log` | `config.archives` | Archive Management |
| Demo | `demo-mode` | | `/admin?tab=demo-mode` | `config.demo-mode` | Demo Mode |

> **Old URLs.** `/config?tab=…` (including `system-settings&subtab=…` and `user-management&subtab=…`), `/communications?tab=…`, `/archive-management?tab=…`, `/about?tab=support-features` and `/project?tab=customers&subtab=login-management` redirect to the matching `/admin` page (`client/src/lib/admin-redirects.ts`), together with the older moves (Messaging & Alerts, Email Configuration (now the Email card on Integrations › Overview), Media, Schedules, Audit, Maintenance, Backup Destinations, Data Sync, Compliance).

---

### 11. Guide (formerly Getting Started)
**Base Route:** `/getting-started`  
**Component:** `GettingStarted`

| Tab | URL | Section ID | Description |
|-----|-----|------------|-------------|
| `workspace-guide` | `/getting-started?tab=workspace-guide` | `getting_started.workspace-guide` | Workspace Guide |
| `introduction-overview` | `/getting-started?tab=introduction-overview` | `getting_started.introduction-overview` | Introduction |

---

### 12. About
**Base Route:** `/about`  
**Component:** `About`

| Tab | SubTab | URL | Section ID | Description |
|-----|--------|-----|------------|-------------|
| `introduction` | | `/about?tab=introduction` | `about.introduction` | Application introduction |
| `clear2close` | | `/about?tab=clear2close` | `about.clear2close` | Clear2Close methodology |
| `documentation` | | `/about?tab=documentation` | `about.documentation` | Technical documentation |

---

### Standalone Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/artifacts` | `Artifacts` | Legacy artifacts page |
| `/analytics` | — | Redirects to `/reports` (`?tab=calendar` → `/reports?view=calendar`) |
| `/report-builder` | — | Redirects to `/reports` (Report Builder archived) |
| `/tags` | `Tags` | Tag management |
| `/edit-template` | `EditTemplate` | Template editor |
| `/outcomes-dashboard` | `OutcomesDashboard` | Outcomes dashboard |
| `/support-features` | `SupportFeatures` | Support features page |
| `/error-test` | `ErrorTest` | Error boundary testing |
| `/reset-password` | `ResetPassword` | Password reset (unauthenticated) |
| `/setup` | `Setup` | First-boot database setup wizard (unauthenticated; only active when no DB is configured) |

---

## Permission Sections Reference

Sub-item visibility in the sidebar is governed by `client/src/lib/permission-sections.ts`.  
Each sub-item has a `section` property (e.g. `"dashboard.dashboard"`) checked against the active user's role permissions via `canView()` in `usePermissions.ts`.  
Items without a `section` (3rd-level nested items) are always visible when their parent is open.

---

## File References

| Purpose | File Location |
|---------|---------------|
| Route definitions | `client/src/App.tsx` |
| Sidebar menu structure | `client/src/components/layout/sidebar.tsx` |
| Permission section IDs | `client/src/lib/permission-sections.ts` |
| Permission hook | `client/src/hooks/usePermissions.ts` |
| Sub-item arrays | `sidebar.tsx` lines ~210–465 |

---

## Maintenance Notes

**When to update this document:**
1. Adding new pages or routes
2. Modifying sidebar menu structure
3. Adding/removing tabs or sub-tabs
4. Changing permission section IDs in `permission-sections.ts`
5. Version updates (update version number at top)

**Update checklist:**
- [ ] Update version number and date
- [ ] Add new routes to appropriate section
- [ ] Update tab/subtab tables
- [ ] Verify Section IDs match `permission-sections.ts`
- [ ] Verify file line references are still accurate
- [ ] Test navigation links in running application
