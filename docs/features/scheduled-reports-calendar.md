# Reports page and scheduled reports calendar

**Insights › Reports** (`/reports`) is one page: every report a staff user
can run, with the scheduled-send calendar built in. It replaced the
Analytics section's Library and Calendar tabs (and, before that, a mock
calendar of three hard-coded reports). Old URLs redirect:
`/analytics?tab=calendar` opens the calendar view, any other `/analytics`
URL and `/report-builder` open the library.

## Page layout

Built from [`client/src/pages/reports.tsx`](../../client/src/pages/reports.tsx)
and [`client/src/components/reports/`](../../client/src/components/reports/):

1. **Search & Filters**: search (name and description), Kind (Built-in,
   Security, Saved; multi-select), Schedule (scheduled / not scheduled),
   Starred. **Schedule report** sits in the card header for users with
   edit on Reports (`analytics.main`). The filters narrow the table and
   the calendar alike.
2. **Four counts for this month** (the shared `MetricCard`): Scheduled
   reports (active schedules, by frequency), Sent this month (and to how
   many people), Failed this month (and the last failure), Next send.
3. **Library table beside a calendar rail** (default view):
   - One sortable table of every report: the six built-in reports, Login
     Audit (only with Login History view, `config.login-history`), and the
     user's saved custom reports. Columns: Report (starred ones show a
     star), Kind, Next send, Last run (Sent / Completed / Failed with the
     date), and actions Run, Schedule, Star, Delete (saved reports only).
     Default order: starred, then soonest send, then name.
   - The rail has a small month with a dot per status on each day, a
     legend, and the next sends in the coming 7 days.
4. **Calendar view** (`/reports?view=calendar`): clicking a day on the
   rail, or its expand button, folds the table to one line and shows the
   month full width with report names on each day (up to three, then
   "+N more"), and the sends of the chosen day (or the month) beside it.
   **Show reports table** (or the folded line) goes back. Back and Forward
   follow the switch.

**Run** opens a side drawer with the report's rows (sortable) and
**Download CSV**. Built-in reports come from
`GET /api/built-in-reports/:id/results`; saved custom reports from
`POST /api/custom-reports/:id/execute` (first 100 rows). Login Audit opens
its own full page.

One permission covers the whole page: Reports (`analytics.main`). The old
Calendar page key (`analytics.calendar`) was retired with the Calendar tab;
its role rows are ignored.

## Run a built-in report in the app

`GET /api/built-in-reports/:reportId/results` (staff only and Reports
view, `analytics.main`) runs the same definition a scheduled send uses
([`shared/system-reports.ts`](../../shared/system-reports.ts)) over every
project the viewer's mode can see, with no date window, and returns
`{ reportId, reportName, columns, rows, truncated, executedAt }`, at most
1,000 rows (`truncated` says when more matched). MAP Progress adds the MAP
task counts. It is a GET so it also works during View As. Code:
[`server/lib/built-in-report-run.ts`](../../server/lib/built-in-report-run.ts).

## Where the data comes from

- A scheduled report is an `email_schedules` row with
  `action_type = 'report_generation'`, created from
  **Reports › Schedule report** (or Schedule on a report's row, which picks that report)
  ([`ScheduleReportDialog.tsx`](../../client/src/components/analytics/ScheduleReportDialog.tsx))
  through `POST /api/email-automation/schedules`. The same rows appear on
  **Admin › Monitoring & Audit › Scheduler** (see [scheduler.md](scheduler.md)).
- Past runs are `automation_run_logs` rows (status `success` or `failure`,
  `triggered_by` `scheduler` or `manual`). A successful run whose
  `raw_output.details.delivered` is true is **Sent**; a successful run
  from before delivery existed (it only recorded the run) is **Completed**.
- Upcoming runs are expanded from each **active** schedule's cron in its own
  timezone (croner), from now to the end of the visible grid. Paused
  schedules show their past runs only.
- The creator is stored server-side in `metadata.createdBy` when the
  schedule is created and kept on every update. Schedules created before
  this change show "Unknown" as the creator.

## API

`GET /api/report-schedules?from=YYYY-MM-DD&to=YYYY-MM-DD`

- Both dates are required; the range may span at most 62 days (a month
  grid is 35–42). The server widens it by a day on each side so every
  timezone's local days are covered; the client buckets events into the
  viewer's local days.
- Returns `{ schedules, events }`. Each schedule carries report name and
  category, `reportKey` (`system:<id>` or `custom:<id>`, read from the
  action config by `reportRefFromActionConfig`, which delivery uses too;
  the Reports table matches schedules to reports by it), frequency (hourly / daily / weekly / monthly / custom, derived
  from the cron like Schedule Report's presets), timezone, active, next and
  last run, recipients and creator. Each event is
  `{ key, scheduleId, at, status: 'upcoming' | 'sent' | 'success' | 'failure', message, triggeredBy }`.
- Contract and helpers: [`shared/report-schedule-calendar.ts`](../../shared/report-schedule-calendar.ts).
  Query: `getReportScheduleCalendar` in
  [`server/storage/report-schedules.ts`](../../server/storage/report-schedules.ts).

## Access

- Signed-in staff only (`requireInternalUser`), like running a report.
- Then the schedule rights from `server/lib/schedule-permissions.ts`:
  view on the Scheduler (`config.scheduler`) or on Reports
  (`analytics.main`, the owning page of `report_generation`). Otherwise 403.

Each listed send shows the report name, status (blue upcoming, green sent,
teal completed, red failed), time, frequency, creator, recipients, and the
failure reason for a failed run. Paused schedules and manual runs are
marked.

## Delivery

When a scheduled report runs (on its cron or with **Run now**), the
`report_generation` action calls `deliverScheduledReport` in
[`server/email/scheduled-report-email.ts`](../../server/email/scheduled-report-email.ts):

1. **Creator check.** The schedule runs on behalf of `metadata.createdBy`.
   If that user no longer exists, is inactive or unapproved, or is now an
   outside user (Customer, Guest, Partner), the run fails with that reason
   and nothing is sent. Schedules saved before the creator was recorded
   still run.
2. **Report.** A custom report runs its saved definition (fields and
   filters, made with the now-archived Report Builder); a deleted one fails the run. The six built-in
   reports are fixed definitions in
   [`shared/system-reports.ts`](../../shared/system-reports.ts), which
   Schedule Report also lists from:

   | Report | Columns |
   |---|---|
   | Project Status | customer, opportunity, solution, status, customer status, primary engineer, owning team, start, end |
   | Customer Activity | account, region, opportunity, solution, status, last updated |
   | Team Performance | team, subteam, primary engineer, customer, status, completed date, ACV |
   | Risk Analysis | customer, opportunity, status, risk level, risk score, last risk analysis, end |
   | Success Criteria | customer, opportunity, criterion product, criterion, criterion status (active criteria, one row per criterion) |
   | MAP Progress | project id, customer, opportunity, MAP template, status, start, end, plus MAP tasks done / total / % complete |

   Both run through the same `runReportQuery` as Run Report
   (`server/storage/custom-reports.ts`), never on demo projects.
3. **Date window.** Calendar mode (Last 7 / 30 days, Last quarter, Year to
   date, Custom) keeps projects active at any time in the window: started
   on or before its end and not ended before its start (no end date counts
   as still open). Project mode bounds the project's own start and end
   dates; "Project Start / End Date" leaves that side open.
4. **Recipients.** Only active, approved staff users receive a report
   (it reads every project with no account scoping, the same reason running
   one is staff only). Other addresses are skipped and named in the run
   message; with no staff recipient left the run fails. Saving a schedule
   (`POST` / `PUT /api/email-automation/schedules`) refuses such addresses
   with a 400 that lists them.
5. **Email.** Subject `[CriteriaIQ] <report name>`; the body has the date
   window, the first 25 rows as a table and a link to Reports (`/reports`); every row
   (up to 1,000, with a note when cut off) is attached as UTF-8 CSV.
   Spreadsheet formulas in text cells are defused with a leading
   apostrophe. Sent through the main email service (configured transport,
   Email Design, email log, each user's "receive emails" setting, never in
   Demo Mode), `email_type = 'scheduled_report'`. While Workflow Automation
   test mode is on it goes to the test addresses with the usual
   `[TEST MODE - Original: …]` prefix. Quiet hours and the hourly send
   limit do not apply: the person chose the time.

The run succeeds when at least one email went out; its message says who got
it and who was skipped, and `details.delivered` marks it **Sent** on the
calendar. Older schedules saved by the generic schedule editor
(`reportType` `project_summary`, `map_progress`, `customer_activity`,
`team_performance`, or `custom` with `customReportId`) map onto the same
reports.

## Demo Mode

- `email_schedules.is_demo` (migration 117). In Demo Mode the Reports calendar, the
  schedule list and the schedule routes see only demo scheduled reports;
  real scheduled reports never show. Other schedule types (cleanups,
  syncs) are operational and stay visible in Demo Mode. Outside Demo Mode,
  demo rows never show.
- A scheduled report created while in Demo Mode is flagged demo.
- The scheduler never runs a demo schedule, and **Run now** refuses one (409).
- The demo seed adds four scheduled reports owned by and sent to Demo Staff,
  with six weeks of runs including a few failures
  ([`server/lib/demo-report-schedules.ts`](../../server/lib/demo-report-schedules.ts)).
  The wipe deletes them; their run logs cascade.

## Related files

- [`client/src/pages/reports.tsx`](../../client/src/pages/reports.tsx) (the page)
- [`client/src/components/reports/`](../../client/src/components/reports/) (table, calendar rail and full view, counts, results drawer, `reports-library-utils.ts`)
- [`client/src/components/analytics/analytics-calendar-utils.ts`](../../client/src/components/analytics/analytics-calendar-utils.ts) (events by local day)
- [`client/src/components/analytics/ScheduleReportDialog.tsx`](../../client/src/components/analytics/ScheduleReportDialog.tsx) and [`LoginAuditReport.tsx`](../../client/src/components/analytics/LoginAuditReport.tsx)
- [`server/routes/audit-and-reports-routes.ts`](../../server/routes/audit-and-reports-routes.ts) (`/api/report-schedules`, `/api/built-in-reports/:id/results`)
- [`server/lib/built-in-report-run.ts`](../../server/lib/built-in-report-run.ts) (Run for built-in reports)
- [`server/routes/email-automation-routes.ts`](../../server/routes/email-automation-routes.ts) (schedule CRUD, Demo Mode checks)
- [`server/services/scheduler.ts`](../../server/services/scheduler.ts) (skips demo schedules)
- [`server/email/scheduled-report-email.ts`](../../server/email/scheduled-report-email.ts) and [`server/lib/scheduled-report-format.ts`](../../server/lib/scheduled-report-format.ts) (delivery)
- [`shared/system-reports.ts`](../../shared/system-reports.ts) (built-in report definitions)
