# Scheduler

**Admin › Monitoring & Audit › Scheduler** (`/admin?tab=scheduler`) is the one place
for every recurring background job the server runs. It is modeled on
ImpactIQ's Admin → Scheduling page.

## What the page shows

- **Search & Filters**: job name, category (the groups below) and status
  (Healthy, Error, Disabled, Never run, Waiting for CRM).
- **KPIs**: jobs whose last run failed, jobs turned off, jobs that have
  never recorded a run, jobs with no error email, and failed runs in the
  last 7 days, on the app's shared KPI card
  (`client/src/components/shared/MetricCard.tsx`). Jobs waiting for a CRM
  aren't counted.
- **Scheduled jobs**: grouped by what each job does, as on ImpactIQ's
  Scheduling page: CRM sync (outgoing), CRM data and link checks,
  Notifications and emails, Workflow Automation, Sign-in and security,
  Housekeeping, and Other for a job not yet filed. The map is
  `shared/job-categories.ts`. Each group is a collapsible row showing how
  many of its jobs are active and inactive, and turns red when one of its
  jobs last failed. Groups start collapsed; a search or filter opens them
  all. Inside a group, one row per job with when it runs, last result, next
  run, an on/off switch, an **Email on error** switch, and Run now /
  Change run time / Reset / View run history actions. A job runs on one
  of four kinds of schedule:
  - **Every N** (most jobs): pick a cadence from the list.
  - **Daily at a time** (the Salesforce broken-link check): Change run
    time sets the time and the timezone. The default is server time.
  - **Custom schedule** (Salesforce scheduled syncs): a cron expression
    set on another page. The row shows it and links to where it's edited.
  - **On an event** (the Welcome email): no timer. The job runs each time
    the event happens, e.g. "When a user completes registration". The row
    links to where its content is edited; there is no Run now.
- **Workflow schedules**: the schedules an admin or another page created
  (email digests, metric snapshots, Salesforce sync, cleanup, report
  delivery, webhook retry, project status check, documentation sync, AI
  assessment analysis), with Add, Edit, Delete, Run now
  and per-schedule run history. Moved here from Workflow Automation's
  Schedules tab, which was removed (old links redirect here).
- **Send Email Window**: quiet hours and the max emails per hour for
  automated email. See below.
- **Recent runs**: every recorded run, newest first, 20 a page, across
  every job or for the job picked in the filter. Job, Status, Started,
  Duration and Source headers sort the whole history on the server
  (`GET /api/scheduler/runs?sortKey=&sortDir=`), since the list is paged. **Clear run history**
  (Scheduler edit only, after a confirmation) deletes the `job_runs` rows
  for that scope from the database: every job, or only the filtered job.
  A job's last-run status and the Failed runs count start over with it.

## CRM jobs

Salesforce and HubSpot jobs follow the CRM chosen at Admin › Integrations
› Overview › CRM (`crmJobAccess` in `shared/job-categories.ts`):

- **A CRM is chosen**: only that CRM's jobs are listed. The other CRM's
  jobs and their runs are hidden, and the API answers 404 for them.
- **No CRM (the default)**: every CRM job is listed as **Waiting for CRM**,
  switched off, with no next run. Its switches, cadence and Run now are
  locked, and the API refuses changes and runs with 409
  `crm_not_chosen`. A notice above the table links to the CRM setting.

The jobs' own ticks stand down too (`onlyWhenCrmActive`), so a CRM job
never runs while its CRM isn't the chosen one, whatever its switch says.

Only runs that did work or failed are recorded. A tick with nothing to do
(no expired sessions, data folder still writable, no documentation
repositories) writes nothing, so a quiet job doesn't flood the history.
Run now on a job with nothing to do shows "had nothing to do".

## Who can use it

The page is the `config.scheduler` section in Role Management. View shows
the page; Edit unlocks the switches, cadence picker, run time, Run now and Clear run history. Admins
always have both. A role with no setting for it has None (see
`docs/features/role-permissions.md`).

## Jobs on the scheduler

| Key | Default schedule | Notes |
|---|---|---|
| `sessions_cleanup` | 24 h | Deletes expired sign-in sessions. First run 60 s after boot. |
| `audit_logins_cleanup` | 24 h | Deletes login history older than `AUDIT_LOGINS_RETENTION_DAYS`. |
| `mcp_activity_cleanup` | 24 h | Deletes MCP tool-call logs older than 30 days. |
| `data_dir_watcher` | 5 min (`DATA_DIR_WATCHER_INTERVAL_MS`) | Records a run only when the data folder becomes unwritable (error) or recovers. |
| `docs_sync` | `docs_sync_schedule.sync_interval_hours` (24 h) | Pulls documentation from connected repositories. |
| `job_runs_cleanup` | 24 h | Deletes Scheduler run history older than `JOB_RUNS_RETENTION_DAYS` (90). |
| `salesforce_sync_queue` | 1 min | Sends save-triggered changes to Salesforce and retries due ones. Records a run only when it processed items; the message has the counts. One server copy at a time. |
| `salesforce_link_check` | Daily 03:00, server time | Flags linked Salesforce records that were deleted. Run time and timezone editable. One server copy at a time. |
| `salesforce_scheduled_sync_project` / `_customer` / `_user` | Cron from the object's Sync Policy | Only listed while the policy has a scheduled sync. Edited on Integrations → Salesforce → Sync Policies. A sync where every record failed is a failed run; one with some errors is a success whose message says so. |
| `welcome_email` | On each self-service registration | Sends the `welcome` email template to the new user (access code or open signup). One run row per registration, source "Event": "Sent to …", or "Not sent to …: reason" when preferences, quiet hours or the hourly limit held it back. Template edited at Communications → Email Templates. Users an admin creates get their welcome email from the create-user form instead (its own "skip welcome email" option). This used to be the seeded "Welcome Email — New User Registration" Workflow Automation rule; migration `096_welcome_email_to_scheduler.sql` removed that rule (or just its Welcome send, if an admin added other actions) and carried a disabled rule over as a disabled job, so nobody gets two emails. Code: `server/email/welcome-email-job.ts`. |
| `workflow_schedules_tick` | 1 min, fixed | Runs Workflow Automation schedules that are due (digests and other actions). One server copy at a time, so a digest isn't sent twice. A schedule's own failure shows in Workflow Automation's run history; the tick fails only when it can't read the schedules. |

The environment variables that set each job's interval still work; they
set the default. A cadence saved on the page overrides the default.

## Email on error

With **Email on error** on, a failed run emails every approved Admin:
the job, the time and the error, with a link to this page. At most one
email per job per day (`job_config.last_error_email_at`, reserved before
sending so two server copies can't both send). It goes through the main
email service (transport, Email Design, email log) and respects Workflow
Automation test mode. Off by default for every job, like ImpactIQ.
Sender: `server/email/scheduled-job-failed-email.ts`.

## Several server copies

- A job marked `singleInstance` (the Salesforce and Workflow jobs) runs
  under a Postgres advisory lock on its key (`server/services/jobs/locks.ts`),
  so only one copy runs it at a time. A copy that can't get the lock skips
  that tick; Run now answers "already running".
- A daily or cron job claims each slot in `job_config.last_slot_at`
  before running, so the slot runs once across all copies. If the claim
  can't be written (database hiccup), the job runs rather than miss it.
- Known gap, unchanged from before: a Sync Policy schedule change is
  applied on the copy that saved it; other copies pick it up on restart.

## How it works

- `server/services/jobs/scheduler.ts`: the registry. Each job calls
  `scheduleJob({ key, category, label, task, ... })` with exactly one of
  `defaultIntervalMs` (every N ms, fixed-rate), `dailyAt: { hour, minute }`
  (a clock time, default server timezone) or `cron: { expression,
  timezone }` (a schedule owned elsewhere) or `event` (the event that
  runs the job; no timer), plus `cadenceEditable`,
  `minIntervalMs`, `firstRunDelayMs`, `singleInstance` and `editPath`.
  Runs never overlap, and a task returns `{ status: "skipped" }` for a
  quiet tick or throws to record a failure. An event job has no `task`;
  each occurrence calls `fireEventJob(key, task)`, which honors the
  on/off switch, records the run with source `event` and sends the error
  email. Occurrences may run side by side. The module has no database
  imports, so job unit tests use fake timers without a database.
- `server/services/jobs/index.ts`: `startJobScheduler()` runs at boot
  before the jobs register. It injects storage, the advisory lock, the
  slot claim and the failure email, loads the saved overrides and re-reads
  them every minute so a change saved on another replica is picked up
  (a changed run time re-arms the timer).
- `job_config` (migrations `084_job_scheduler.sql`, `085_job_config_last_slot.sql`):
  one row per job key with the admin's overrides (on/off, cadence, run
  time, timezone, error email) plus the last claimed slot. No row means
  the job's defaults. A
  Documentation sync that was turned off in `docs_sync_schedule` is
  carried over as `enabled = false`.
- `job_runs`: run history, written only for runs that did work or failed.
- Storage: `server/storage/scheduler.ts`. Routes:
  `server/routes/scheduler-routes.ts`.

| Route | Permission |
|---|---|
| `GET /api/scheduler` | view |
| `GET /api/scheduler/runs?jobKey=&limit=` | view |
| `PATCH /api/scheduler/jobs/:jobKey` (`{ enabled?, intervalMs?, dailyAt?: { hour, minute }, timezone?, notifyOnError? }`; `null` resets cadence, run time or timezone) | edit |
| `POST /api/scheduler/jobs/:jobKey/run` | edit |
| `GET /api/scheduler/send-window` (settings plus `sentThisHour` and `serverTimezone`) | view |
| `PUT /api/scheduler/send-window` (`{ quietHoursEnabled?, quietHoursStart?, quietHoursEnd?, quietHoursScope?: "digests" \| "all", timezone?, maxEmailsPerHour? }`; `timezone: null` = server time) | edit |

Saving a shorter cadence takes effect right away; a longer one from the
next run; a new run time moves the next run right away. A job's cadence
can't go below its minimum (1 hour for the cleanup jobs and
documentation sync). A run time or timezone can only be set on a daily
job, and the timezone must be a valid IANA name.

Saved changes are recorded on the `job_config` row (`updated_by`,
`updated_at`) and Run now on the run row (`triggered_by`); there is no
separate audit-log entry.

## Adding a job

1. Call `scheduleJob()` from the job's start function with a stable
   snake_case key and an English `label` (used in the failure email),
   and return `{ status: "skipped" }` when there is nothing to do. Set
   `singleInstance: true` if two server copies must not run it at once.
2. Add `scheduler.jobNames.<key>.name` and `.description` to
   `client/src/i18n/locales/en-US.json` and the other five locales.
3. File the key under a group in `shared/job-categories.ts` (it shows
   under Other until you do). A Salesforce or HubSpot job takes that
   `category` and wraps its task in `onlyWhenCrmActive`.
4. Add the job to the table above.

## Send Email Window

App-wide limits on automated email, stored on the `email_automation_config`
row and enforced in `server/email/send-window.ts`.

- **Quiet hours**: off by default. A start and end hour (end not included;
  a window like 22:00 to 07:00 wraps past midnight; equal hours never
  apply) in one timezone, server time by default. **Applies to**:
  - *Scheduled digests only* (default): a digest due during quiet hours
    is skipped and its items stay pending for the next run.
  - *All automated email*: rule-triggered emails during quiet hours are
    skipped too and logged as skipped.

  A digest schedule can turn off "Use global quiet hours" and set its own
  hours; those apply to that schedule even when the global switch is off.
  Run now respects quiet hours (like ImpactIQ) and says when a run was
  held.
- **Max emails per hour**: a shared budget for digests and rule-triggered
  emails, counted per clock hour (UTC) in `email_hourly_send_counts`.
  The count is taken atomically, so several server copies share one
  limit. Over the limit, emails are skipped, not queued: digest items stay
  pending for the next run, rule sends are logged as skipped. `0` means no
  limit. Existing installs keep the old default of 500, now enforced.

Never held by either limit: sign-in emails (template category
Authentication: welcome, password reset, account approved). Not covered:
scheduled report delivery, the "Scheduled job failed" email and other
emails sent outside Workflow Automation. Settings are cached for 30 s per
server copy. If the hourly counter can't be read, email is sent anyway.

Migration `087_email_send_window.sql` adds `quiet_hours_enabled`,
`quiet_hours_scope` and `send_window_timezone` to `email_automation_config`
and creates `email_hourly_send_counts` (rows older than 2 days are pruned
on the first send of each hour).

## Workflow schedules

Rows in `email_schedules`, run by the `workflow_schedules_tick` job. The
card reads and writes them through the existing
`/api/email-automation/schedules` routes (list, create, update, delete,
`/:id/trigger`, `/:id/runs`); run history is `automation_run_logs`. The
editor is `client/src/components/scheduler/WorkflowScheduleEditorDialog.tsx`
(English only for now). Add, Edit, Delete and Run now are shown only with
edit access to `config.scheduler`.

### Who can see and change workflow schedules

The routes enforce this on the server (`server/lib/schedule-permissions.ts`):

- `config.scheduler` covers every schedule: view to list them and see run
  history, edit to create, change, delete or run one.
- Feature pages create schedules of their own kind, so the page that owns
  an action type grants the same rights for that type only:

  | Action type | Owning page (section) |
  |---|---|
  | `email_digest` | Workflow Automation (`config.workflow-automation`) |
  | `metric_snapshot` | none (Scheduler only; Metric Builder was archived) |
  | `salesforce_sync` | Integrations (`config.salesforce-configuration`) |
  | `report_generation` | Reports (`analytics.main`); shown on the Reports page calendar ([scheduled-reports-calendar.md](scheduled-reports-calendar.md)) |
  | `webhook_retry` | Webhooks (`config.email-configuration`) |
  | `docs_sync` | Documentation Sources (`ai-risk.docs`) |
  | `ai_assessment_analysis` | Projects (`ai-risk.projects`) |

- Database cleanup and project status checks have no owning page
  and need the Scheduler itself.
- The schedule list only returns schedules the user may view. Changing a
  schedule's type needs edit rights on both the old and new type. An
  unknown action type is refused.
- The rule evaluate, execute and simulate routes need edit access to
  Workflow Automation.
- Admins always pass.
