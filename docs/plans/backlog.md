# Backlog

Ideas and deferred follow-ups that are not scheduled yet. One line each, with a
pointer to the longer write-up where one exists. When an item ships, delete it
here and document it in [`../features/`](../features/); when one becomes real
work, give it its own plan in this folder.

> Replaces `docs/FUTURE_ENHANCEMENTS.md` and the open items from the old
> session handoff. Section numbers like "FE §2" refer to sections of that
> original roadmap.

**Active sweeps** have their own plans and are not repeated here:
[dark mode](dark-mode-sweep-plan.md), [i18n](i18n-sweep-plan.md),
[standard tables](table-filter-upgrade-plan.md).

## Collaboration and notifications

| Item | Notes | Source |
|---|---|---|
| Comments and threads | Timestamped, attributed comments on projects, gaps, criteria and MAP tasks, alongside the existing notes fields. Optional reply threading. | FE §2 |
| @mentions | Tag a user in a comment or note; delivers through the `user_notifications` bell list shipped in v0.11.0. | FE §1.3 |
| Browser push notifications | Service worker + Web Push for critical alerts when the tab is closed, opt-in per user. The in-app list and daily digest already exist. | FE §1.1 |
| Action items for engineers and customers | A personal to-do list that spans projects. | Old PROJECT_REFERENCE roadmap |
| Activity feed dashboard widget | New dashboard widget reading `activity_logs` across projects (mine / my team / all). | FE §3 |

## UI and UX

| Item | Notes | Source |
|---|---|---|
| Remove unused pages | Once Admin › Monitoring & Audit › Page Usage has 4 to 6 weeks of counts, remove pages nobody opens. The Insights builders (Report, Dashboard, Metric) were already archived on 2026-11-05 (`archive/analytics-builders/`). See [`../features/page-usage.md`](../features/page-usage.md). | Parity plan P4-4 |
| Retire Analytics builder leftovers | Report Builder storage methods (`createCustomReport`, `updateCustomReport`, `previewReport`, `getReportSourceMetadata`, `getReportExecutions`) have no callers; `dashboard_metrics`, `dashboard_configs` and `widget_configs` have no writers; role rows for `analytics.report-builder`/`dashboard-builder`/`metric-builder` and `analytics.calendar` (the Calendar tab, now part of Reports) are unused. Remove after the prod check (`reports/analytics-section/prod-check-queries.sql` in project files). | Analytics review 2026-11 |
| ProjectIQ coach marker on Manage Projects | The table's coach icon (left of the competitors icon) renders only when a project has `hasCoaching: true`. Nothing sets it yet because ProjectIQ Coach is still "Coming soon". When Coach stores coaching, have `GET /api/projects` send `hasCoaching` and the icon appears. See [`../features/manage-projects.md`](../features/manage-projects.md). | Manage Projects table, 2026-11-14 |
| Error state cards | One reusable inline card for failed fetches, empty results, no permission, offline and not found. Extends `ErrorBoundary`, does not replace it. | FE §5 |
| In-component loading skeletons | Table/Card/Form/List/Chart skeleton variants, then replace about 51 spinner or "Loading..." states. Page-level `PageSkeleton` is done. | FE §4, §8 |
| Organize created content | My / Other / System / Inactive grouping plus created/updated by and when, for Validation Criteria, Artifacts and AI Assessments (Reports is being redesigned without it). Show criteria and every template list grouped by category. | Old PROJECT_REFERENCE roadmap |
| MAP Management summary requests | `MapManagementSection.tsx` fetches `/map` and `/map/analytics` per project. Every project can have a MAP, so it runs for all projects and drops those with no phases. Replace with one server-side summary endpoint. | Quick plans, 2026-11-11 |
| Value Journey: template criteria links | Task ↔ criterion links are set per project in the MAP drawer. Let MAP and validation criteria templates carry the links so a new project starts with them. See [`../features/value-journey.md`](../features/value-journey.md). | Value Journey, 2026-11-13 |
| Value Journey: hard agreement gate | The agreement gate only warns. Decide whether to block starting the gate stage's MAP work (or the Build phase status change) until the customer has agreed. | Value Journey, 2026-11-13 |
| MAP: stored roll-up status | Phases and steps show a status rolled up from their children but store their own. Decide whether to save the rolled-up status automatically (and what automation triggers that fires). | MAP drawer redesign |
| Customer workspace, follow-ups | Project messages (with unread counts on the Account Portal) and Mark done shipped in the side panel. Not done yet: ticking to-dos from the roadmap pins, live updates over the websocket instead of the 30-second refresh, a rate limit on posting messages. See [`../features/project-page.md`](../features/project-page.md). | Customer workspace redesign, 2026-11-10 |
| Fix or remove project Download PDF | The header button was removed on 2026-11-10 at Eric's request, so the export can't be started; decide whether to bring it back elsewhere (fixed) or delete `downloadPDF` from `project-detail.tsx`. It stopped at the first capture: `html2canvas` 1.4.1 throws "unsupported color function oklch" on Tailwind 4 colors, and the error path leaves the tab area hidden. Swap to a fork that reads `oklch`/`color-mix` (for example `html2canvas-pro`) or print the page instead. | Project page redesign, 2026-11-05 |
| Image lazy loading | `loading="lazy"` on below-the-fold images. | FE §6.1 |
| Smaller ideas | PWA install/offline, PDF export of project reports and dashboards, keyboard shortcut reference, onboarding tours, virtual scrolling for large tables, high-contrast mode. | FE §9 |
| Tailwind 4 polish | `text-shadow` utilities on headings; `@starting-style` entry animations for dialogs, sheets and dropdowns. | FE §13.2, §13.3 |

## AI

| Item | Notes | Source |
|---|---|---|
| Competitor coaching on project details | AI support and coaching on the project page using Competitor Intelligence, with CRM context. | Old PROJECT_REFERENCE roadmap |

## Identity and security

| Item | Notes | Source |
|---|---|---|
| SSO v2 for outside users | Customer-tenant SAML 2.0 / per-organization IdPs for Customer, Partner and Guest, plus SCIM provisioning. v1 (Okta and Entra ID OIDC for internal users) is live. | FE §6.3, `../features/single-sign-on.md` |
| Access codes set allowed login methods | Let an access code pre-set Okta only / Okta + password / password only for invitees. | Old handoff |
| Strip Internal Project Status from project payloads for outside users | The Account Portal and project page hide it in the UI only; `status` still reaches Customer, Partner and Guest browsers. Filter it (and hidden deliverable tabs) server-side. | `../features/account-portal.md` |

## Integrations

| Item | Notes | Source |
|---|---|---|
| Workflow rules on n8n events | Let Workflow Automation rules fire on the 16 event kinds n8n receives. Watch for duplicate emails. | n8n review, 2026-10-20 |
| n8n webhook wizard card | Dedicated n8n card in the webhook wizard (Generic HTTP already works). | FE §10 |
| VectorIQ cross-app links | Same summary API and identity rule as ImpactIQ. | Parity plan, Phase 3 |
| Users connected counts | Per-CRM "N of M users connected" on Admin › Integrations › Overview, from `/api/crm/me` data. | Profile and Calendar plan, 2026-10-27 |
| Sortable workload table | The Detailed User Workloads table on the MAP drawer's Assignments tab (`MapAssignmentTracker.tsx`) still uses plain header cells, not `SortableTableHead`. | Profile and Calendar thread, 2026-10-29 |

## Engineering

| Item | Notes | Source |
|---|---|---|
| Postgres service container in CI | DB-backed integration suites skip in CI today because there is no `DATABASE_URL`. | Old handoff, FE §10 |
| Database refactor (deferred) | Drafted in `migrations/db_refactor/` and never run: UUID primary keys, CHECK/NOT NULL/FK constraints, 35+ indexes. Read its `README.md` for risks before starting. The index script is the cheapest piece to take on its own. | Old PROJECT_REFERENCE "Database Refactor (Feb 2026)" |
| `useActionState` for complex forms | React 19 pattern for pending, error and result state on Create/Edit Project, Create User and Evaluation Request. | FE §13.1 |
| Drizzle relational queries | Replace sequential queries plus JS merging (project detail, customer with projects, user with roles) with `db.query.*` `with:` calls. | FE §13.7 |
| Zod 4 format validators | `z.string().email()` / `.url()` to `z.email()` / `z.url()` across `shared/schema/`. | FE §13.8 |
| Stricter TypeScript flags | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`. | FE §13.6 |
| Vite Environment API | Separate client and server build environments. No user-visible change. Low priority. | FE §13.4 |
| Recharts 3 upgrade | Update `client/src/components/ui/chart.tsx` to the Recharts 3 tooltip/legend types, then fix the dashboard widgets (`payload` props, `PieSectorDataItem.originalValue`) and check every chart in light and dark mode. Dependabot ignores Recharts majors until then. | Dependabot #493 |
| TypeScript 7 | The native compiler has no JavaScript API yet, and the `lint:toasts`, `lint:api-request-json` and `lint:heavy-imports` gates parse code with it. Upgrade once TS 7 ships the API, or move those gates to another parser. Dependabot ignores TypeScript majors until then. | Dependabot #493 |
