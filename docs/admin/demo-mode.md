# Demo Mode (Task #723)

> Operator reference for the **Admin › Demo › Demo Mode** page (`/admin?tab=demo-mode`).

Demo Mode lets an admin show the application against fully synthetic, isolated data without exposing real customer or project records. It is admin-only and audited.

## How it resolves

A request is "in demo" when **any** of the three independent sources is on:

| Source     | Storage                                                                 | Lifetime                          |
| ---------- | ----------------------------------------------------------------------- | --------------------------------- |
| Session    | `req.session.demoMode` (set via *Per-session* toggle)                   | This browser session only         |
| User       | `users.demoModeForcedOn` boolean column                                 | Persistent until admin clears it  |
| App-wide   | `system_settings.demo_mode_app_wide` jsonb (`{ enabled: boolean }`)     | Persistent until admin clears it  |

Resolution is computed once per request by the demo middleware (`server/lib/demo-mode.ts`) and stored in an `AsyncLocalStorage` so storage helpers can consult it via `isCurrentRequestDemo()` without threading the flag through every function.

Priority: any single source ON ⇒ demo is ACTIVE. The `source` value reported by `/api/demo/status` lists every contributing flag (e.g. `session+app_wide`).

## Excluded screens

These screens always operate against production data, even when demo is active:

- System Settings (`/api/system/*`)
- User Management (`/api/users`, `/api/roles`, `/api/role-permissions`, `/api/user-permissions`)
- Audit (`/api/audit`)
- Archive (`/api/archive`, `/api/archived`)
- About / Getting Started (`/api/about`, `/api/getting-started`)
- The Demo Mode page itself (`/api/demo/*`)
- Schema migrations (`/api/admin/schema-migrations`)
- DB connection management (`/api/db-connections`)

These screens still show the amber Demo Mode card in the sidebar so operators know they are in demo, but every read/write goes against real data. Each excluded page surfaces an inline `Production data — Demo Mode does not affect this screen` badge for clarity.

## Tagged tables

Every isolation-tagged table gained an `is_demo boolean NOT NULL DEFAULT false` column with a single-column index `idx_<table>_is_demo`:

- customers, customer_access
- projects, activity_logs
- map_phases, map_steps, map_tasks, map_links, map_templates
- custom_reports, dashboard_layouts
- tags, assumptions, dependencies
- email_templates, ai_provider_configs, products
- components, criteria_library, expected_outcomes, action_items, value_mappings (migration 114, the Validation Criteria library); the Quick plan MAP templates are map_templates rows
- teams (migration 115). Subteams and team and subteam memberships have no flag of their own: they belong to their team's mode and cascade with it. `listTeams`, `getTeam`, `getSubteam`, `listSubteams` and `getDefaultTeamId` filter by mode, `createTeam` flags teams made in a demo, and saving a person's teams in a demo never touches their real team places.
- documents, links, code_scripts (migration 126, Artifacts). Storage reads, updates and deletes of these rows filter by mode, and new rows take the mode of the request (a client can't set `is_demo`), so real artifacts never show in a demo and demo ones never show outside it.
- email_logs, webhooks, webhook_deliveries, mcp_tool_calls, system_announcements (migration 133, integration and admin history). Email Logs, Webhooks, n8n subscriptions, MCP Server activity and System Announcements show only the rows of the current mode. Demo webhooks are inactive, point at `.invalid` hosts and are refused by the webhook service, so they can never send. The three log tables are deleted by `is_demo = true` but are not in the wipe's count check (step 5 below), because real sends and the retention cleanup change their counts at any time.
- email_rules, email_rule_audits, assessment_jobs, validation_criteria_templates (migration 135, Workflow Automation, AI assessment jobs and Criteria Builder). Workflow Automation (rules, triggers, stats, Execution feed), the AI assessment job list and Criteria Builder show only the rows of the current mode, and new rules and templates take the mode of the request. The automation engine and the scheduler never run a demo rule, so it can't send mail or act on a project. Email digest schedules follow their rule's mode (as scheduled reports do), and a schedule can't name a rule of the other mode. Rule runs and assessment jobs are deleted by `is_demo = true` but are not in the wipe's count check, because real runs add rows at any time.
- technology_spaces, competitors (migration 119, Competitor Intelligence). The space, solution, tag, document, link and activity rows of a competitor have no flag of their own and cascade with it; project and account competitor links follow their project or account.

`users` got `demo_mode_forced_on boolean NOT NULL DEFAULT false`.

## Endpoints

All endpoints below require `role = Admin` and write a `demo_mode_events` row (see Audit below).

| Method | Path                              | Purpose                                            |
| ------ | --------------------------------- | -------------------------------------------------- |
| GET    | `/api/demo/status`                | Resolved state + per-source flags                  |
| POST   | `/api/demo/session/enter`         | Set caller's session flag                          |
| POST   | `/api/demo/session/exit`          | Clear caller's session flag                        |
| POST   | `/api/demo/users/:id/enter`       | Force demo on for a user                           |
| POST   | `/api/demo/users/:id/exit`        | Clear demo for a user                              |
| POST   | `/api/demo/app-wide`              | `{ enabled: boolean }` — flip the app-wide flag    |
| GET    | `/api/demo/users`                 | Users + their `demoModeForcedOn` flag              |
| POST   | `/api/demo/seed`                  | Generate fake data via faker; returns counts. 409 `demo_data_exists` when demo data is already there |
| POST   | `/api/demo/reseed`                | Wipe, then seed a fresh set (body: seed options + `confirm: "RESEED DEMO DATA"`); returns `counts` and `wiped` |
| POST   | `/api/demo/wipe`                  | DELETE rows where `is_demo = true`; returns counts |
| GET    | `/api/demo/audit`                 | Last 50 Demo Mode events, with names              |

### Seed body

```json
{ "customers": 6, "projectsPerCustomer": 2, "mapDepth": 3, "includeAi": false }
```

`mapDepth` is the number of steps per MAP phase and tasks per step (0 gives every project a Quick plan); every full MAP has all five phases. The page's defaults are the values above.

### One demo set at a time

As in ImpactIQ, there is one demo data set. **Seed** works only when no demo data exists (the button is disabled otherwise and the API answers 409); a second seed would duplicate the demo library and solutions. **Reseed** replaces the current set in one step: the wipe below, then a seed with the settings on the page. Because every date is relative to today, a reseed also brings an old demo up to date. If the seed half fails after the wipe, the demo is left empty and the error is shown; real data is never touched.

### Seed data quality

The seeder generates realistic content that reflects the application's live configuration:

| Field | Behaviour |
|---|---|
| **Internal Status** | Planned, not drawn at random (`planDemoStatuses` in `server/lib/demo-story.ts`). Every active `status_configs` name is used at least once when there are enough projects, so each board column and filter has cards; the rest follow a believable mix: about 32% in progress, 24% won, 16% late (TCC, Completed), 14% lost or cancelled, 10% planning and 4% other (On Hold). The seed reads the lists through the storage getters, which create the default statuses, risk levels and rankings on a new install. |
| **Account Status** | Planned to fit the Internal Status (`planAccountStatuses`, `accountStatusFits`): Complete only on won or late projects, On Hold only on paused ones, Selecting Solution and Evaluating Other Vendors on early, open or lost ones, and so on. Every active `customer_status_configs` name is used at least once when some project fits it; the rest lean to On Time for open projects. A name the admin made up fits any open project. The default seed (6 accounts, 12 projects) shows all 8 default Internal and 9 default Account statuses. |
| **Validation Criteria library** | Three demo solutions (Identity Governance, Privileged Access Management, Access Analytics) with their components, criteria, expected outcomes, actions taken and value mappings, all linked, plus one one-phase Quick plan MAP template each (`server/lib/demo-library.ts`). Each has an icon (ShieldCheck, KeyRound, ChartNoAxesCombined) and no uploaded graphic, so the icon shows wherever the solution appears; uploading a graphic replaces it. Every row is `is_demo = true`, so Demo Mode shows this library and never the real one. |
| **Solution name** | One demo solution per project (two on about a quarter). Each account's Solutions list is the solutions its projects validate. |
| **Project Type and Opportunity** | Project Type is one of the values the project form offers (`PROJECT_TYPES` in `shared/project-types.ts`: POC, POV, Trial, Partner, RTU). The Opportunity Name is `<account> <solutions> <type>`. |
| **Artifacts** | `server/lib/demo-artifacts.ts`. Per demo solution: a datasheet, an internal battlecard, two links and two code scripts. Per account: a current-state architecture document (Customer Artifacts). Per project: a kickoff deck and a test plan, a solution architecture once work is under way and a readout once closed, attached as Project Documents, plus two Project Links. Each document has a one-page PDF in the configured file storage under `demo/documents/`, so Download works; the wipe deletes the rows, then the files no remaining document points at. |
| **Integration history** | `server/lib/demo-integration-history.ts`. About a month of Email Logs to demo people (added to a project, MAP task due, status changed, daily digest, two failures), two inactive webhooks (an n8n subscription and a Microsoft Teams channel) with their delivery history, including a failed delivery the retry then sent, a week of MCP tool calls with one throttled call and two errors (no access key is created), and two running System Announcements. |
| **ImpactIQ effort** | Demo projects aren't in ImpactIQ, so in Demo Mode the SE Effort card and the Manage Projects Activities column show figures from `server/impactiq/demo-effort.ts` instead of calling ImpactIQ: hours and activities by person (the project's engineers and account rep) and by ImpactIQ's default activity types, growing with the stage, with cost for roles allowed to see it. The same project always shows the same figures; the column counts the activity types chosen in ImpactIQ settings, or every type when none are chosen. There is no Open in ImpactIQ link. |
| **Board fields** | Environment, Risk, Ranking, Sales Stage and Forecast Category are set on every project, so each Project Board view has cards. Risk and Ranking use only configured values; sales stage and forecast follow the stage (won → Closed Won / Closed). |
| **Value journey** | MAP template and project phases are tagged with the journey stages in order (`stageForPhase` in `demo-seeder.ts`): Kickoff → Plan, Setup → Build, Testing → Validate, Readout → Decide, Expansion → Handoff, so a full MAP shows the whole journey. The last third of each project's criteria are nice-to-haves (`criterionPriorityFor` in `demo-story.ts`); criteria are placed in the plan's third phase (Validate) and linked to its tasks, and their statuses follow that phase (`planCriteria` with `validationProgress`): none met before testing starts, about as many as the phase has done while it runs, every must-have once it ends. Lost and cancelled projects failed one or two must-haves, so Validate stays current; about half of the late projects failed a nice-to-have and still went ahead. The agreement is the gate into Build (`demoAgreementFor`): projects still planning have sent the criteria and wait on the customer; every project past planning has them agreed by the customer champion, and about a third of those mid-test reworded a criterion since, so the page asks to agree again. Won projects get a handoff team from the demo ProServ users (Tomas Herrera, Grace Liu). See [value-journey.md](../features/value-journey.md). |
| **Status history** | Each project's status changes are in `project_audits` (`planStatusHistory`): Planning → In Progress → (TCC for won projects) → the final Internal Status, made by the primary engineer, and On Time → the final Account Status, made by the customer champion, spread over the project window. |
| **Customer industry** | Each demo customer is assigned a randomly selected active `industries` row (`industry_id`). |
| **Project Purpose & Goals** | `business_problem`, `customer_objective`, and `policy_considerations` are generated from an industry-aware content map covering Healthcare, Finance, Government, Manufacturing, Technology, Education, Retail, and Energy. `solution_description` references the assigned solution name. |
| **Stage** | Each project's stage comes from its Internal Status (`stageForStatus` in `server/lib/demo-story.ts`): early, mid, late, won, lost or other. Dates, MAP progress, criteria and outcomes follow the stage. About a third of closed projects ended in the last 3–40 days (so this quarter's Won/Lost KPIs have numbers); the rest closed over the previous five quarters, which fills Fiscal Trends. Open ones end in the future, so nothing open is overdue on the first day. |
| **Owners (Demo Staff)** | Five fixed demo users own every demo project: two Solutions Engineers, an Identity Specialist, an Account Executive (account rep) and an SE Manager (supporting). Real engineers are never assigned. |
| **Account users** | Each account gets two Customer-role users (`users.account_id` = the account): a Technical Champion and an Economic Buyer. Both are on the account's contact list (so Create Project finds account users), in each project's `customer_users` and in `customer_access` (view). Open them with View As to show the customer portal. |
| **MAP plan** | Phases, steps and tasks come from a five-phase identity-governance plan (Kickoff and Discovery → Expansion). Tasks run end to end across the project window on working days, are owned by the demo team (every third task by the champion), and are completed as far as the stage implies, in order: everything before the current task is `complete`, nothing after an unstarted task is started, and every task has a status (`not_started`, `in_progress`, `blocked` or `complete`, the values the MAP editor offers). Phases and steps roll up status and dates from their tasks. |
| **Success criteria** | 4–6 per project from its solutions' library criteria (with solution, component and value mapping), with statuses the criteria form offers (`pending`, `in_progress`, `at_risk`, `complete`, `fail`) following the Validate phase (see Value journey). |
| **MAPs** | Every project gets a named MAP (`MAP#<id> - <account> - <date>`): about three in four projects from the full demo MAP template (**[demo] Identity Governance Full Validation**), the rest a Quick plan from their solution's one-phase demo MAP template (customer emails off). |
| **Solution gaps** | Up to two gaps per project past planning, with gap types, statuses and criticality from the gap form. |
| **Outcomes** | Won, lost and cancelled projects get a `project_outcomes` row with a reason code from the outcome dialog's list. The third closed project is left without one (an `outcome_requests` row with status `preexisting`, which sends no reminders) so Missing Outcomes has an entry. |
| **AI risk** | When a risk ruleset exists, every project gets two AI risk runs two weeks apart (`project_risk_predictions`, provider `demo`) and the latest score on the project, so AI Assessments and the R-Index column have data. A high or critical latest run raises a risk alert, as the risk engine does; a closed project's alert is acknowledged by its primary engineer. No AI call is made. |
| **KPI history** | Twelve weekly `metric_snapshots` per dashboard metric, under keys prefixed `demo:`, computed from the demo projects as they stood each week. The sparklines read these in demo only; the wipe deletes them. |
| **Templates and reports** | One project template per demo solution (criteria and plan filled in, pointing at that solution's Criteria Builder template), two email templates (kickoff, weekly status) and three shared reports (pipeline by forecast category, results by solution, criteria status). |
| **Criteria Builder templates** | One template per demo solution (`server/lib/demo-criteria-templates.ts`), named `<solution> evaluation criteria`, with the solution's icon. It walks the whole library: solution → each component → its criteria → each criterion's expected outcome → the action that shows it, in the format the builder saves. The first is starred. The project templates and the demo projects whose first solution it is point at it, so the list shows usage, and Create Project fills criteria from it. |
| **Workflow Automation** | Six rules (`server/lib/demo-automation.ts`): a welcome email to the SE lead when a project is created, a celebration when one is won, an email when risk rises to High, a notice for each completed MAP task, a new AI risk run once every criterion is met (on the demo risk ruleset) and a turned-off stalled-project rule. Each has about a month of run history in the Execution feed, mostly run, with one failed email and one run whose conditions didn't match. Recipients are Demo Staff, and demo rules never run. |
| **AI assessment jobs** | Three Analyze All jobs on demo projects (`planDemoAssessmentJobs`): one finished clean, one finished with a failed project and one failed, so the AI Assessments job list has history. No AI call is made. |
| **Tags** | Six named tags (Audit Driven, Competitive, …); each project carries one or two. |
| **CRM ids** | `crm_provider`, `crm_opportunity_id` and `crm_account_id` in the format of the install's CRM (Salesforce 18-character `006…`/`001…`, HubSpot 11-digit). None when no CRM is chosen. Demo projects never sync (the CRM queue and close check skip `is_demo`). |
| **Teams** | Two demo teams staffed by Demo Staff (`server/lib/demo-teams.ts`): **[demo] Solutions Engineering** (manager Elena Sokolova) with subteams North America › East and West (region, one SE leading each) and Identity Specialists (product), and **[demo] Enterprise Sales** (manager Marcus Chen) with Strategic Accounts (type). Each project is owned by the SE team and its primary SE's region subteam; about one in five goes to Enterprise Sales › Strategic Accounts. Real teams never show in Demo Mode, and demo teams never show outside it. |
| **Competitor Intelligence** | Two generic technology spaces (Identity & Access, Data Protection) and three fictional vendors (**[demo] Bluepeak Security**, **[demo] Keystone Access**, **[demo] Harborline Data**) with profiles, linked to the demo solutions (`server/lib/demo-competitors.ts`). Every other demo project faces one of them (open projects "Evaluating", so High-Risk Opps has data; closed ones "Own"), and each demo account records the vendor it owns. Fresh installs seed no competitor data, so this is the only sample content the page gets. If a real space already uses a demo code, the demo copy takes the next free one (IAM2). |
| **Requests** | One support request per account (from the champion, assigned to a demo SE), and an open evaluation request on every other account. |
| **Notifications** | A few bell notifications for the seeding admin about mid, late and won projects. The bell shows them only in demo. |
| **Assumptions, dependencies** | Four of each, written for an identity-governance validation, in the install's default categories. Every project lists two assumptions and three dependencies (`server/lib/demo-project-extras.ts`), owned by the account's champion; dependency statuses follow the stage (`planDependencyStatuses`): all open before work starts, resolved and in review mid-way, all resolved once late or won, one failed on a lost project and one blocked on hold. The first dependency is linked to a success criterion. |
| **Infrastructure Discovery** | Each account has a default "Discovery call" profile (`planDiscoveryProfile`) with every drawer section filled in, attached to the account's projects. |
| **The presenter's projects** | The person who seeds is a supporting engineer on every other project, so the views that open on Show My Projects (Manage Projects, Project Schedules) have work in them. The place goes with the project on wipe. |

### Demo people

Demo Staff and champions are real `users` rows (the users table has no `is_demo` column) marked by an email at `demo.criteriaiq.invalid`. `.invalid` is a reserved top-level domain, so no mailbox or identity provider can own one. They have no password and `receive_emails = false`, so they can't sign in or get mail. They are active and approved only so View As can open them, and they start with their role's Role Management permissions. They do appear in User Management while demo data exists (it always shows real data). The wipe removes them after the demo rows; one that real data still points at is deactivated instead.

### Wipe body (safety phrase required)

```json
{ "confirm": "WIPE DEMO DATA" }
```

The wipe handler refuses any other phrase. The SQL it issues is exclusively `DELETE … WHERE is_demo = true` per table — production rows (`is_demo = false`) are never inspected, locked, or updated by this code path.

## Storage isolation

Storage methods that should hide demo rows when the request is *not* in demo (and vice-versa) call `applyDemoFilter(table)` from `server/lib/demo-storage.ts`. The helper returns:

- in demo context → `eq(table.isDemo, true)`
- in production context → `eq(table.isDemo, false)`

Wired list methods (in the Phase 7 storage mixins under `server/storage/`):

- `getCustomers`, `getAllCustomersIncludingInactive` (`project-resources.ts`)
- `getProjects` (`core.ts`)
- `getTags`, `getAllSystemTags` (`tags.ts`)
- `getProducts`, `getActiveProductsWithCriteria` (`products.ts`)
- `getEmailTemplates` (`email.ts`)
- `getCustomReports` (`custom-reports.ts`)
- `getDashboardLayouts` (`dashboard.ts`)
- `getMapTemplates`, `getMapTemplatesWithStats` (`map.ts`)
- `getActivityLogsByPoc` (`criteria.ts`)

MAP template usage (`getMapTemplateApplications`, `getMapTemplateUsageStats` in `map.ts`) counts only projects of the current mode through `applyDemoFilterByProject`, so a system template's "used by" list never names a demo account outside Demo Mode.

Wired list methods outside the storage layer (Task #773):

- `GET /api/assumptions` (`server/routes.ts`)
- `GET /api/dependencies` (`server/routes.ts`)
- `aiProviderService.getAllConfigs` (`server/ai/ai-provider-service.ts`) — backs `GET /api/admin/ai-providers`

Untagged tables that hang off a project or account follow the mode of that parent, through `applyDemoFilterByProject(col)` / `applyDemoFilterByCustomer(col)` (`server/lib/demo-storage.ts`). In demo: only rows on demo parents. Otherwise: rows on real parents plus rows with no parent. Wired in:

- `getDashboardStats`, `getMapDashboardStats` (`dashboard-stats.ts`) — KPI tiles count only the current mode
- `getSupportRequests(+Count)`, `getEvaluationRequests(+Count)` (`requests.ts`)
- `getAllProjectOutcomes`, `getOutcomeStatistics`, `getOutcomesWithMissingData` (`pcos.ts`)
- Competitor analytics summary, per-competitor project counts and related projects (`competitors-routes.ts`)
- `GET /api/gaps` and available gaps (`gap-analysis-routes.ts`)

Always real-only, whatever the request mode: metric snapshots (trend history), scheduled actions (end-date alerts, overdue auto-status, AI risk runs), outcome reminders and escalations, the hourly CRM close check, the Salesforce/HubSpot sync queue, Workflow Automation rule runs (the engine and the scheduler skip demo rules) and the health monitor's rule and run counts. Scheduled reports and email digest schedules are the exception: they are mode-scoped (`MODE_SCOPED_ACTION_TYPES` in `server/lib/schedule-permissions.ts`), so Demo Mode lists only demo ones, and demo ones never run.

### Plans on demo projects

A project's plan rows (`map_phases`, `map_steps`, `map_tasks`, `map_template_applications`) take `is_demo` from the project, not from the session: starting a Quick plan, Add to plan, applying a MAP template and the workflow-automation "create MAP task" action all copy `projects.is_demo`. A plan built on a demo project is therefore demo data whoever builds it, and Wipe Demo Data counts and removes it. MAP template content takes the template's flag: copying a template in a demo session makes a demo copy (with its phases, steps and tasks), and saving a demo template's content keeps its rows demo.

Single-record fetches (`getCustomer(id)`, `getEmailTemplate(id)`, etc.) are intentionally not filtered — they're keyed by the row's primary key so the right context already produced the id. Other read paths that take a `WHERE projectId = ?` or `WHERE userId = ?` predicate inherit isolation transitively (a demo session can only have produced demo project ids); `getActivityLogsByPoc` still adds an explicit `applyDemoFilter(activity_logs)` belt-and-braces guard against a stray cross-context id.

## Side effects are off in demo

Demo data is fake, but the people on it (engineers, account reps, webhook receivers) are real. While a request is in demo (and not on an excluded screen):

- `emitAutomationEvent` emits nothing: no webhooks (n8n, ImpactIQ), no bell notifications, no MAP email rules. The webhook service also refuses to deliver from a demo request and never delivers to a demo webhook.
- `storage.createUserNotifications` writes nothing, so outcome-request and support/evaluation-request notifications stay quiet.
- `sendEmail` sends nothing and returns `{ success: false, error: "Email is not sent in Demo Mode" }` (a test email from a demo session shows that error).

## Wipe safety

The wipe runs inside a single Postgres transaction (`db.transaction`). Inside the transaction:

1. Rows of tagged tables that hang off a demo project or account but were written without the flag (for example a MAP phase added during a demo) are claimed: `UPDATE … SET is_demo = true`. Projects and customers themselves are never claimed.
2. The non-demo row counts are captured (after the claim).
3. Before demo projects and accounts are deleted, rows of untagged tables that point at a demo project or account through a RESTRICT foreign key are removed: AI risk predictions and alerts, kanban audit events, support requests, evaluation requests. Email logs, map templates, users and archived users keep their row with the project/account link set to NULL. The count is returned as `untaggedChildren`.
4. Each tagged table is `DELETE … WHERE is_demo = true` in child→parent order. The library's link tables (product ↔ component/criteria/outcome/action/value mapping, criteria ↔ outcome/value mapping, outcome ↔ action) are cleared first for any link with a demo side.
5. Before COMMIT, the non-demo counts are taken again for every tagged table; any change from step 2 aborts the transaction.

If anything fails between those steps, the entire wipe rolls back — there is no partial-wipe state.

After the transaction commits, the `demo:` KPI history is deleted, and demo people are removed one at a time (`removeDemoUsers` in `server/lib/demo-story.ts`), each with their page permissions. One that real data still points at is deactivated instead, so it never fails the wipe. The result reports the count as `users`.

## UI

- **Sidebar indicator** (`client/src/components/layout/SidebarDemoIndicator.tsx`) — an amber "Demo Mode" card at the bottom of the sidebar nav, anchored directly above the divider that opens the footer, whenever any source is on. Its second line is source-aware ("Enabled by your session", "your account", "the entire application", or a combination). When the per-session flag is the only source, the card shows an inline **Exit demo** (×) button so the operator can step out without navigating to Configuration → Demo Mode. Collapsed, it shrinks to an amber icon with the same text in its tooltip. The indicator determines whether the *currently rendered route* is excluded by consulting `client/src/lib/demoExcluded.ts` against the current location (the tooltip then says the screen shows production data) — the server cannot decide this because its own request path (`/api/demo/status`) is always excluded.
- **Excluded notice** (`client/src/components/layout/ExcludedScreenNotice.tsx`) — small inline badge on excluded screens.
- **Page** (`client/src/components/configuration/DemoModeSection.tsx`) — admin form covering all toggles, seed, and wipe. The per-user section is a **searchable picker** (search by name/email/role; capped at 50 hits) rather than a full table, so it stays usable on instances with hundreds of users. Turning the **app-wide** flag ON pops a confirmation dialog (`AlertDialog`); turning it OFF is one click. An in-page **How Demo Mode works** accordion mirrors this doc.
- **Hook** (`client/src/hooks/useDemoStatus.ts`) — TanStack Query against `/api/demo/status`, polling every 30s. Returns mode flags only; the `excluded` decision is computed client-side per route (see above).

## Audit

Every toggle (session, user, app-wide), seed, reseed and wipe writes one row to `demo_mode_events` (migration 134) with:

- `action ∈ {demo_session_enter, demo_session_exit, demo_user_enter, demo_user_exit, demo_app_wide_enable, demo_app_wide_disable, demo_seed, demo_reseed, demo_wipe}`
- `details`, the event's facts as JSON (`DemoEventData` in `server/lib/demo-events.ts`): `targetUserId` for a per-user switch, `counts` for what a seed or reseed added, `wiped` for what a wipe or reseed removed
- `user_id`, the admin who made it

`GET /api/demo/audit` returns the last 50 events with the admin's and the target user's names and the counts. **Recent Activity** on the Demo Mode page shows them as a sortable table (When, Action, By, Details) in the reader's language: a seed or wipe lists its accounts and projects, and **Show all** lists every count (`client/src/components/configuration/DemoModeActivityTable.tsx`).

These are real rows: the wipe never touches them.

The Demo Mode page surfaces the last 50 such rows under "Recent activity".
